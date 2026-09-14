-- Restrict client RPCs and make live-game closeout atomic.
-- Internal SECURITY DEFINER helpers are owner-only; exposed RPCs are explicit.
drop policy if exists "players update their own row" on public.game_players;

create or replace function public.start_hand(p_game_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_game       public.games;
  v_maxseat    int;
  r            record;
  v_seats      int[];
  v_dealer     int;
  v_sb_seat    int;
  v_bb_seat    int;
  v_first      int;
  v_hand_id    uuid;
  v_handno     int;
  v_n          int;
  v_deck       text[];
  v_hole       text[];
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'Game not found'; end if;
  if auth.uid() is null or v_game.host_id <> auth.uid() then raise exception 'Only the host can start a hand'; end if;
  if v_game.status <> 'active' then raise exception 'Game is not active'; end if;

  if exists (select 1 from public.hands where game_id = p_game_id and status <> 'complete') then
    raise exception 'Finish the current hand first';
  end if;

  -- Assign seats to any approved player that doesn't have one yet.
  select coalesce(max(seat), 0) into v_maxseat
    from public.game_players where game_id = p_game_id and seat is not null;
  for r in
    select id from public.game_players
     where game_id = p_game_id and status = 'approved' and seat is null
     order by joined_at
  loop
    v_maxseat := v_maxseat + 1;
    update public.game_players set seat = v_maxseat where id = r.id;
  end loop;

  select array_agg(seat order by seat) into v_seats
    from public.game_players
   where game_id = p_game_id and status = 'approved' and stack > 0;

  v_n := coalesce(array_length(v_seats, 1), 0);
  if v_n < 2 then raise exception 'Need at least 2 players with chips'; end if;

  if v_game.dealer_seat is null then
    v_dealer := v_seats[1];
  else
    select coalesce(
      (select s from unnest(v_seats) s where s > v_game.dealer_seat order by s limit 1),
      v_seats[1]
    ) into v_dealer;
  end if;

  if v_n = 2 then
    v_sb_seat := v_dealer;
    v_bb_seat := (select s from unnest(v_seats) s where s <> v_dealer limit 1);
  else
    v_sb_seat := coalesce((select s from unnest(v_seats) s where s > v_dealer order by s limit 1), v_seats[1]);
    v_bb_seat := coalesce((select s from unnest(v_seats) s where s > v_sb_seat order by s limit 1), v_seats[1]);
  end if;

  select coalesce(max(hand_number), 0) + 1 into v_handno
    from public.hands where game_id = p_game_id;

  if v_game.digital_cards then
    select array_agg(card order by random()) into v_deck
    from unnest(array[
      '2s','3s','4s','5s','6s','7s','8s','9s','Ts','Js','Qs','Ks','As',
      '2h','3h','4h','5h','6h','7h','8h','9h','Th','Jh','Qh','Kh','Ah',
      '2d','3d','4d','5d','6d','7d','8d','9d','Td','Jd','Qd','Kd','Ad',
      '2c','3c','4c','5c','6c','7c','8c','9c','Tc','Jc','Qc','Kc','Ac'
    ]) as card;
  else
    v_deck := '{}'::text[];
  end if;

  insert into public.hands (game_id, hand_number, dealer_seat, street, status,
                            current_bet, last_raise, pot, board)
  values (p_game_id, v_handno, v_dealer, 'preflop', 'betting',
          v_game.big_blind, v_game.big_blind, 0, '{}'::text[])
  returning id into v_hand_id;

  insert into public.hand_players (hand_id, player_id, seat, committed, committed_street, status, has_acted)
  select v_hand_id, gp.id, gp.seat, 0, 0, 'active', false
    from public.game_players gp
   where gp.game_id = p_game_id and gp.status = 'approved' and gp.stack > 0;

  if v_game.digital_cards then
    for r in select id, player_id from public.hand_players where hand_id = v_hand_id order by seat loop
      v_hole := v_deck[1:2];
      v_deck := v_deck[3:array_length(v_deck, 1)];
      insert into public.hand_hole_cards (hand_id, hand_player_id, player_id, cards)
      values (v_hand_id, r.id, r.player_id, v_hole)
      on conflict (hand_id, hand_player_id) do update set cards = excluded.cards;
    end loop;
  end if;

  insert into public.hand_deck (hand_id, cards) values (v_hand_id, coalesce(v_deck, '{}'::text[]))
  on conflict (hand_id) do update set cards = excluded.cards;

  perform public._post_blind(v_hand_id, v_sb_seat, v_game.small_blind);
  perform public._post_blind(v_hand_id, v_bb_seat, v_game.big_blind);

  update public.hands set pot = (select coalesce(sum(committed),0) from public.hand_players where hand_id = v_hand_id)
   where id = v_hand_id;

  v_first := public._next_active_seat(v_hand_id, v_bb_seat);
  update public.hands
     set current_turn = (select player_id from public.hand_players where hand_id = v_hand_id and seat = v_first)
   where id = v_hand_id;

  update public.games set dealer_seat = v_dealer where id = p_game_id;

  return v_hand_id;
end;
$$;

create or replace function public.player_action(p_hand_id uuid, p_action text, p_amount numeric default 0)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hand    public.hands;
  v_game    public.games;
  v_hp      public.hand_players;
  v_stack   numeric;
  v_profile uuid;
  v_is_host boolean;
  v_clock_expired boolean;
  v_expired boolean;
  v_tocall  numeric;
  v_target  numeric;   -- target street commitment (for bet/raise/all_in)
  v_add     numeric;   -- chips added now
  v_min_raise_to numeric;
  v_in_hand int;
  v_actor_seat int;
  v_next    int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_hand from public.hands where id = p_hand_id for update;
  if v_hand.id is null then raise exception 'Hand not found'; end if;
  if v_hand.status <> 'betting' then raise exception 'Not accepting actions'; end if;

  select * into v_game from public.games where id = v_hand.game_id;
  v_is_host := (v_game.host_id = auth.uid());

  -- The acting hand_player is whoever's turn it is.
  select * into v_hp from public.hand_players
   where hand_id = p_hand_id and player_id = v_hand.current_turn;
  if v_hp.id is null then raise exception 'No player to act'; end if;

  select profile_id, stack into v_profile, v_stack
    from public.game_players where id = v_hp.player_id;

  v_clock_expired := v_hand.turn_deadline is not null
                 and now() > v_hand.turn_deadline;

  -- The clock has run out AND this is a non-committal action AND the caller is
  -- actually in this game: anyone at the table may move the game along.
  -- (The host doesn't need this branch — v_is_host already lets them act.)
  v_expired := v_clock_expired
           and p_action in ('fold', 'check')
           and public.is_game_participant(v_hand.game_id);

  if not v_is_host
     and not v_expired
     and (v_profile is null or v_profile <> auth.uid()) then
    raise exception 'Not your turn';
  end if;

  v_actor_seat := v_hp.seat;
  v_tocall := v_hand.current_bet - v_hp.committed_street;

  if p_action = 'fold' then
    update public.hand_players set status = 'folded', has_acted = true where id = v_hp.id;

  elsif p_action = 'check' then
    if v_tocall > 0 then raise exception 'Cannot check facing a bet'; end if;
    update public.hand_players set has_acted = true where id = v_hp.id;

  elsif p_action = 'call' then
    v_add := least(v_tocall, v_stack);
    update public.game_players set stack = stack - v_add where id = v_hp.player_id;
    update public.hand_players
       set committed = committed + v_add,
           committed_street = committed_street + v_add,
           has_acted = true,
           status = case when v_stack - v_add <= 0 then 'all_in' else status end
     where id = v_hp.id;

  elsif p_action in ('bet', 'raise', 'all_in') then
    if p_action = 'all_in' then
      v_target := v_hp.committed_street + v_stack;
    else
      v_target := p_amount;
    end if;
    v_add := v_target - v_hp.committed_street;

    if v_add <= 0 then raise exception 'Amount must increase your bet'; end if;
    if v_add > v_stack then raise exception 'Not enough chips'; end if;

    if p_action = 'bet' then
      if v_hand.current_bet > 0 then raise exception 'There is already a bet — raise instead'; end if;
      if v_target < v_game.big_blind and v_add < v_stack then
        raise exception 'Minimum bet is %', v_game.big_blind;
      end if;
    elsif p_action = 'raise' then
      if v_hand.current_bet = 0 then raise exception 'Nothing to raise — bet instead'; end if;
      v_min_raise_to := v_hand.current_bet + v_hand.last_raise;
      if v_target < v_min_raise_to and v_add < v_stack then
        raise exception 'Minimum raise is to %', v_min_raise_to;
      end if;
    end if;

    update public.game_players set stack = stack - v_add where id = v_hp.player_id;
    update public.hand_players
       set committed = committed + v_add,
           committed_street = committed_street + v_add,
           has_acted = true,
           status = case when v_stack - v_add <= 0 then 'all_in' else status end
     where id = v_hp.id;

    -- A bet/raise above the current bet reopens the action for everyone else.
    if v_target > v_hand.current_bet then
      update public.hands
         set last_raise = v_target - v_hand.current_bet,
             current_bet = v_target
       where id = p_hand_id;
      update public.hand_players
         set has_acted = false
       where hand_id = p_hand_id and status = 'active' and id <> v_hp.id;
    end if;

  else
    raise exception 'Unknown action %', p_action;
  end if;

  -- "auto" means the clock ran out and somebody OTHER than the player moved the
  -- game along (a player folding just after their own clock expired is still a
  -- deliberate fold). Keyed off v_clock_expired, not v_expired, so a
  -- host-triggered timeout is labelled too — the host is not a seated player,
  -- so is_game_participant() is false for them.
  insert into public.hand_actions (hand_id, player_id, street, action, amount, auto)
  values (p_hand_id, v_hp.player_id, v_hand.street, p_action, coalesce(v_add, 0),
          coalesce(v_clock_expired, false)
            and p_action in ('fold', 'check')
            and (v_profile is null or v_profile <> auth.uid()));

  -- Refresh pot from contributions.
  update public.hands
     set pot = (select coalesce(sum(committed), 0) from public.hand_players where hand_id = p_hand_id)
   where id = p_hand_id;

  -- Only one player left in the hand? They win uncontested.
  select count(*) into v_in_hand
    from public.hand_players where hand_id = p_hand_id and status in ('active', 'all_in');
  if v_in_hand <= 1 then
    perform public._award_pot(
      p_hand_id,
      array(select player_id from public.hand_players
             where hand_id = p_hand_id and status in ('active', 'all_in')));
    return;
  end if;

  -- Round over? Advance the street (or go to showdown); else pass the turn.
  if public._betting_complete(p_hand_id) then
    perform public._advance_street(p_hand_id);
  else
    v_next := public._next_active_seat(p_hand_id, v_actor_seat);
    update public.hands
       set current_turn = (select player_id from public.hand_players where hand_id = p_hand_id and seat = v_next)
     where id = p_hand_id;
  end if;
end;
$$;

create or replace function public.expire_turn(p_hand_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_hand   public.hands;
  v_game   public.games;
  v_hp     public.hand_players;
  v_tocall numeric;
  v_action text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_hand from public.hands where id = p_hand_id for update;
  if v_hand.id is null then return false; end if;
  if v_hand.status <> 'betting' then return false; end if;
  if v_hand.turn_deadline is null then return false; end if;
  if now() <= v_hand.turn_deadline then return false; end if;

  select * into v_game from public.games where id = v_hand.game_id;
  if v_game.host_id <> auth.uid()
     and not public.is_game_participant(v_hand.game_id) then
    raise exception 'Not a participant of this game';
  end if;

  select * into v_hp from public.hand_players
   where hand_id = p_hand_id and player_id = v_hand.current_turn;
  if v_hp.id is null then return false; end if;

  -- The SERVER decides check vs fold, so a client can never force a fold where
  -- a free check was available.
  v_tocall := v_hand.current_bet - v_hp.committed_street;
  if v_tocall <= 0 then
    v_action := 'check';
  else
    v_action := 'fold';
  end if;

  perform public.player_action(p_hand_id, v_action, 0);
  return true;
end;
$$;

create or replace function public.declare_winners(p_hand_id uuid, p_winners jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hand public.hands;
  v_game public.games;
  v_item jsonb;
  v_winner_ids uuid[];
  v_pots record;
  v_n int;
  v_share numeric(12, 2);
  v_rem numeric(12, 2);
  v_first uuid;
  v_pot_found boolean;
begin
  select * into v_hand from public.hands where id = p_hand_id for update;
  if v_hand.id is null then raise exception 'Hand not found'; end if;

  select * into v_game from public.games where id = v_hand.game_id;
  if auth.uid() is null or v_game.host_id <> auth.uid() then raise exception 'Only the host can declare winners'; end if;
  if v_hand.status <> 'awaiting_showdown' then raise exception 'Hand must reach showdown first'; end if;

  for v_pots in
    select * from public.get_side_pots(p_hand_id)
  loop
    v_winner_ids := array[]::uuid[];
    v_pot_found := false;

    -- Look up this pot_index in p_winners
    for v_item in select * from jsonb_array_elements(p_winners)
    loop
      if (v_item->>'pot_index')::int = v_pots.pot_index then
        select array_agg(distinct x::uuid) into v_winner_ids
          from jsonb_array_elements_text(v_item->'winner_ids') x;
        v_pot_found := true;
        exit;
      end if;
    end loop;

    -- If not specified, auto-award if only one eligible player
    if not v_pot_found or v_winner_ids is null or array_length(v_winner_ids, 1) is null then
      if array_length(v_pots.eligible_player_ids, 1) = 1 then
        v_winner_ids := v_pots.eligible_player_ids;
      else
        raise exception 'No winners specified for pot %', (v_pots.pot_index + 1);
      end if;
    end if;

    -- Validate all specified winners are eligible for this pot
    if exists (
      select 1 from unnest(v_winner_ids) w
      where not (w = any(v_pots.eligible_player_ids))
    ) then
      raise exception 'Winner in pot % is not eligible for that pot', (v_pots.pot_index + 1);
    end if;

    v_n := array_length(v_winner_ids, 1);
    if v_n is null or v_n = 0 then
      raise exception 'No winners for pot %', (v_pots.pot_index + 1);
    end if;

    v_share := trunc((v_pots.amount / v_n) * 100) / 100;
    v_rem := v_pots.amount - (v_share * v_n);

    update public.game_players gp
       set stack = stack + v_share
     where gp.id = any (v_winner_ids);

    select gp.id into v_first
      from public.game_players gp
      join public.hand_players hp on hp.player_id = gp.id and hp.hand_id = p_hand_id
     where gp.id = any (v_winner_ids)
     order by hp.seat asc limit 1;

    if v_rem > 0 then
      update public.game_players set stack = stack + v_rem where id = v_first;
    end if;
  end loop;

  update public.hands
     set pot = 0, status = 'complete', current_turn = null
   where id = p_hand_id;
end;
$$;

create or replace function public.get_hand_cards_for_eval(p_hand_id uuid)
returns table (player_id uuid, cards text[])
language plpgsql stable security definer set search_path = public
as $$
declare
  v_hand public.hands;
begin
  select * into v_hand from public.hands where id = p_hand_id;
  if v_hand.id is null then return; end if;

  if not exists (
    select 1 from public.games g
     where g.id = v_hand.game_id and g.host_id = auth.uid()
  ) then
    raise exception 'Only the host can evaluate';
  end if;

  if v_hand.status <> 'awaiting_showdown' then
    raise exception 'Cards are available only at showdown';
  end if;

  return query
    select hc.player_id, hc.cards
      from public.hand_hole_cards hc
      join public.hand_players hp
        on hp.hand_id = hc.hand_id and hp.player_id = hc.player_id
     where hc.hand_id = p_hand_id
       and hp.status in ('active', 'all_in');
end;
$$;

create or replace function public.get_side_pots(p_hand_id uuid)
returns table (
  pot_index int,
  amount numeric(12, 2),
  eligible_player_ids uuid[]
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_prev_level numeric(12, 2) := 0;
  v_rec record;
  v_pot_amt numeric(12, 2);
  v_elig uuid[];
  v_idx int := 0;
begin
  if not exists (
    select 1 from public.hands h join public.games g on g.id = h.game_id
    where h.id = p_hand_id and
      (g.host_id = auth.uid() or public.is_game_participant(g.id))
  ) then raise exception 'Not a participant of this game'; end if;
  for v_rec in
    select distinct committed
      from public.hand_players
     where hand_id = p_hand_id
       and status in ('active', 'all_in')
       and committed > 0
     order by committed asc
  loop
    -- Sum of contributions to this layer from ALL players (including folded)
    select sum(greatest(0, least(committed, v_rec.committed) - v_prev_level))
      into v_pot_amt
      from public.hand_players
     where hand_id = p_hand_id;

    -- Find eligible players who committed at least this level
    select array_agg(player_id order by seat asc)
      into v_elig
      from public.hand_players
     where hand_id = p_hand_id
       and status in ('active', 'all_in')
       and committed >= v_rec.committed;

    if coalesce(v_pot_amt, 0) > 0 and array_length(v_elig, 1) > 0 then
      pot_index := v_idx;
      amount := v_pot_amt;
      eligible_player_ids := v_elig;
      return next;
      v_idx := v_idx + 1;
    end if;

    v_prev_level := v_rec.committed;
  end loop;
end;
$$;

-- Do not allow any UI/API status change to strand committed chips.
create or replace function public._guard_game_close()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'finished' and old.status <> 'finished' and exists (
    select 1 from public.hands where game_id = new.id and status <> 'complete'
  ) then raise exception 'Finish the current hand and award its pot before closing the game'; end if;
  return new;
end;
$$;
create trigger guard_game_close before update of status on public.games
for each row execute function public._guard_game_close();

-- Validate and persist the roster, results and final status in one transaction.
create or replace function public.close_live_game(p_game_id uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_game public.games;
  r record;
  v_member uuid;
  v_buy numeric := 0;
  v_cash numeric := 0;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if auth.uid() is null or v_game.id is null or v_game.host_id <> auth.uid() then
    raise exception 'Game not found';
  end if;
  if v_game.status = 'finished' then raise exception 'Game is already closed'; end if;
  if exists (select 1 from public.hands where game_id = p_game_id and status <> 'complete') then
    raise exception 'Finish the current hand and award its pot before closing the game';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Results must be an array';
  end if;
  perform 1 from public.game_players where game_id = p_game_id for update;

  if exists (
    select 1 from jsonb_to_recordset(p_rows) as x(player_id uuid)
    group by player_id having count(*) > 1
  ) then raise exception 'Each player must appear once'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as x(member_id uuid)
    where member_id is not null group by member_id having count(*) > 1
  ) then raise exception 'Choose a different ledger member for each player'; end if;

  -- Exact roster coverage prevents omissions, foreign players and stale forms.
  if jsonb_array_length(p_rows) <> (
    select count(*) from public.game_players where game_id = p_game_id and status = 'approved'
  ) or exists (
    select 1 from jsonb_to_recordset(p_rows) as x(player_id uuid)
    where not exists (
      select 1 from public.game_players gp where gp.id = x.player_id
      and gp.game_id = p_game_id and gp.status = 'approved'
    )
  ) then raise exception 'The roster changed. Reload the results form'; end if;

  for r in select * from jsonb_to_recordset(p_rows)
    as x(player_id uuid, member_id uuid, nickname text, buy_in numeric, cash_out numeric)
  loop
    if r.buy_in is null or r.cash_out is null
       or not (r.buy_in between 0 and 9999999999.99)
       or not (r.cash_out between 0 and 9999999999.99)
       or r.buy_in <> round(r.buy_in, 2) or r.cash_out <> round(r.cash_out, 2) then
      raise exception 'Buy-ins and cash-outs must be nonnegative amounts with at most two decimals';
    end if;
    v_buy := v_buy + r.buy_in;
    v_cash := v_cash + r.cash_out;
    v_member := r.member_id;
    if v_member is null then
      insert into public.members(host_id, name)
      values (auth.uid(), coalesce(nullif(trim(r.nickname), ''), 'Player'))
      returning id into v_member;
    elsif not exists (select 1 from public.members where id = v_member and host_id = auth.uid()) then
      raise exception 'Ledger member does not belong to this host';
    end if;
    update public.game_players set member_id = v_member where id = r.player_id;
    insert into public.game_results(game_id, member_id, buy_in, cash_out)
    values (p_game_id, v_member, r.buy_in, r.cash_out)
    on conflict (game_id, member_id) do update
    set buy_in = excluded.buy_in, cash_out = excluded.cash_out;
  end loop;
  if v_buy <> v_cash then raise exception 'Cash-outs must equal buy-ins before closing'; end if;
  update public.games set status = 'finished', played_on = current_date where id = p_game_id;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public._next_active_seat(uuid, integer) from public, anon, authenticated;
revoke all on function public._betting_complete(uuid) from public, anon, authenticated;
revoke all on function public._award_pot(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public._post_blind(uuid, integer, numeric) from public, anon, authenticated;
revoke all on function public._advance_street(uuid) from public, anon, authenticated;
revoke all on function public._refund_uncalled_bets(uuid) from public, anon, authenticated;
revoke all on function public._touch_turn_deadline() from public, anon, authenticated;
revoke all on function public._guard_game_close() from public, anon, authenticated;
revoke all on function public.is_game_participant(uuid) from public, anon, authenticated;
revoke all on function public.join_game(text, text) from public, anon, authenticated;
revoke all on function public.start_hand(uuid) from public, anon, authenticated;
revoke all on function public.player_action(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.declare_winners(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.get_side_pots(uuid) from public, anon, authenticated;
revoke all on function public.get_my_hole_cards(uuid) from public, anon, authenticated;
revoke all on function public.get_showdown_cards(uuid) from public, anon, authenticated;
revoke all on function public.get_hand_cards_for_eval(uuid) from public, anon, authenticated;
revoke all on function public.expire_turn(uuid) from public, anon, authenticated;
revoke all on function public.close_live_game(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.get_game_by_code(text) from public, anon, authenticated;
grant execute on function public.is_game_participant(uuid) to authenticated;
grant execute on function public.join_game(text, text) to authenticated;
grant execute on function public.start_hand(uuid) to authenticated;
grant execute on function public.player_action(uuid, text, numeric) to authenticated;
grant execute on function public.declare_winners(uuid, jsonb) to authenticated;
grant execute on function public.get_side_pots(uuid) to authenticated;
grant execute on function public.get_my_hole_cards(uuid) to authenticated;
grant execute on function public.get_showdown_cards(uuid) to authenticated;
grant execute on function public.get_hand_cards_for_eval(uuid) to authenticated;
grant execute on function public.expire_turn(uuid) to authenticated;
grant execute on function public.close_live_game(uuid, jsonb) to authenticated;
grant execute on function public.get_game_by_code(text) to anon, authenticated;
