-- Poker Ledger — Phase 3a: betting engine RPCs
-- Server-authoritative Texas Hold'em betting (no cards — physical cards, manual
-- winner declaration). Single main pot in 3a; side pots come in 3b.
--
-- Amount convention: for 'bet' and 'raise', p_amount is the "to" amount — the
-- target total a player wants their THIS-STREET commitment to reach.

-- ---------------------------------------------------------------------------
-- Helper: next seat (strictly after p_from_seat, circular) that is still
-- 'active' (not folded, not all-in). Returns null if none.
-- ---------------------------------------------------------------------------
create or replace function public._next_active_seat(p_hand_id uuid, p_from_seat int)
returns int
language plpgsql stable security definer set search_path = public
as $$
declare
  v_seat int;
begin
  select seat into v_seat from public.hand_players
   where hand_id = p_hand_id and status = 'active' and seat > p_from_seat
   order by seat asc limit 1;
  if v_seat is null then
    select seat into v_seat from public.hand_players
     where hand_id = p_hand_id and status = 'active'
     order by seat asc limit 1;
  end if;
  return v_seat;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper: is the current betting round complete?
-- Every 'active' player has acted and matched the current bet. all-in players
-- are excluded. If <=1 player can still act, the round is trivially complete.
-- ---------------------------------------------------------------------------
create or replace function public._betting_complete(p_hand_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_bet numeric;
  v_active int;
  v_unfinished int;
begin
  select current_bet into v_bet from public.hands where id = p_hand_id;

  select count(*) into v_active
   from public.hand_players where hand_id = p_hand_id and status = 'active';

  if v_active = 0 then
    return true;
  end if;

  select count(*) into v_unfinished
   from public.hand_players
   where hand_id = p_hand_id and status = 'active'
     and (has_acted = false or committed_street < v_bet);

  return v_unfinished = 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper: award the whole pot to a set of winners (equal split; remainder to
-- the earliest seat), then mark the hand complete.
-- ---------------------------------------------------------------------------
create or replace function public._award_pot(p_hand_id uuid, p_winner_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pot   numeric;
  v_n     int;
  v_share numeric;
  v_rem   numeric;
  v_first uuid;
begin
  select pot into v_pot from public.hands where id = p_hand_id;
  v_n := array_length(p_winner_ids, 1);
  if v_n is null or v_n = 0 then
    raise exception 'No winners provided';
  end if;

  -- round shares to cents; give any remainder to the earliest-seated winner
  v_share := trunc((v_pot / v_n) * 100) / 100;
  v_rem := v_pot - (v_share * v_n);

  update public.game_players gp
     set stack = stack + v_share
   where gp.id = any (p_winner_ids);

  select gp.id into v_first
    from public.game_players gp
    join public.hand_players hp on hp.player_id = gp.id and hp.hand_id = p_hand_id
   where gp.id = any (p_winner_ids)
   order by hp.seat asc limit 1;

  if v_rem > 0 then
    update public.game_players set stack = stack + v_rem where id = v_first;
  end if;

  update public.hands
     set pot = 0, status = 'complete', current_turn = null
   where id = p_hand_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_hand: host deals a new hand — assign seats, rotate button, post blinds.
-- ---------------------------------------------------------------------------
create or replace function public.start_hand(p_game_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_game       public.games;
  v_seat       int;
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
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'Game not found'; end if;
  if v_game.host_id <> auth.uid() then raise exception 'Only the host can start a hand'; end if;
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

  -- Eligible players this hand: approved with chips.
  select array_agg(seat order by seat) into v_seats
    from public.game_players
   where game_id = p_game_id and status = 'approved' and stack > 0;

  v_n := coalesce(array_length(v_seats, 1), 0);
  if v_n < 2 then raise exception 'Need at least 2 players with chips'; end if;

  -- Rotate the button to the next eligible seat.
  if v_game.dealer_seat is null then
    v_dealer := v_seats[1];
  else
    select coalesce(
      (select s from unnest(v_seats) s where s > v_game.dealer_seat order by s limit 1),
      v_seats[1]
    ) into v_dealer;
  end if;

  -- Blind seats. Heads-up: dealer is SB.
  if v_n = 2 then
    v_sb_seat := v_dealer;
    v_bb_seat := (select s from unnest(v_seats) s where s <> v_dealer limit 1);
  else
    v_sb_seat := coalesce((select s from unnest(v_seats) s where s > v_dealer order by s limit 1), v_seats[1]);
    v_bb_seat := coalesce((select s from unnest(v_seats) s where s > v_sb_seat order by s limit 1), v_seats[1]);
  end if;

  select coalesce(max(hand_number), 0) + 1 into v_handno
    from public.hands where game_id = p_game_id;

  insert into public.hands (game_id, hand_number, dealer_seat, street, status,
                            current_bet, last_raise, pot)
  values (p_game_id, v_handno, v_dealer, 'preflop', 'betting',
          v_game.big_blind, v_game.big_blind, 0)
  returning id into v_hand_id;

  -- Seat the eligible players into the hand.
  insert into public.hand_players (hand_id, player_id, seat, committed, committed_street, status, has_acted)
  select v_hand_id, gp.id, gp.seat, 0, 0, 'active', false
    from public.game_players gp
   where gp.game_id = p_game_id and gp.status = 'approved' and gp.stack > 0;

  -- Post blinds (capped at stack -> all-in).
  perform public._post_blind(v_hand_id, v_sb_seat, v_game.small_blind);
  perform public._post_blind(v_hand_id, v_bb_seat, v_game.big_blind);

  update public.hands set pot = (select coalesce(sum(committed),0) from public.hand_players where hand_id = v_hand_id)
   where id = v_hand_id;

  -- First to act preflop = next active seat after the big blind.
  v_first := public._next_active_seat(v_hand_id, v_bb_seat);
  update public.hands
     set current_turn = (select player_id from public.hand_players where hand_id = v_hand_id and seat = v_first)
   where id = v_hand_id;

  update public.games set dealer_seat = v_dealer where id = p_game_id;

  return v_hand_id;
end;
$$;

grant execute on function public.start_hand(uuid) to authenticated;

-- Post a blind for the player at a seat (capped at their stack -> all-in).
create or replace function public._post_blind(p_hand_id uuid, p_seat int, p_blind numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pid   uuid;
  v_stack numeric;
  v_pay   numeric;
begin
  select hp.player_id, gp.stack into v_pid, v_stack
    from public.hand_players hp join public.game_players gp on gp.id = hp.player_id
   where hp.hand_id = p_hand_id and hp.seat = p_seat;

  v_pay := least(p_blind, v_stack);
  update public.game_players set stack = stack - v_pay where id = v_pid;
  update public.hand_players
     set committed = committed + v_pay,
         committed_street = committed_street + v_pay,
         status = case when v_stack - v_pay <= 0 then 'all_in' else status end
   where hand_id = p_hand_id and player_id = v_pid;
end;
$$;

-- ---------------------------------------------------------------------------
-- player_action: the current player (or host override) acts.
-- ---------------------------------------------------------------------------
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
  v_tocall  numeric;
  v_target  numeric;   -- target street commitment (for bet/raise/all_in)
  v_add     numeric;   -- chips added now
  v_min_raise_to numeric;
  v_in_hand int;
  v_actor_seat int;
  v_next    int;
begin
  select * into v_hand from public.hands where id = p_hand_id;
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

  if not v_is_host and (v_profile is null or v_profile <> auth.uid()) then
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

  insert into public.hand_actions (hand_id, player_id, street, action, amount)
  values (p_hand_id, v_hp.player_id, v_hand.street, p_action, coalesce(v_add, 0));

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

grant execute on function public.player_action(uuid, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Advance to the next street, or to showdown after the river. Fast-forwards
-- through streets when no one can act (everyone remaining is all-in).
-- ---------------------------------------------------------------------------
create or replace function public._advance_street(p_hand_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hand   public.hands;
  v_next   text;
  v_dealer int;
  v_canact int;
  v_first  int;
begin
  loop
    select * into v_hand from public.hands where id = p_hand_id;

    if v_hand.street = 'river' then
      update public.hands set status = 'awaiting_showdown', current_turn = null where id = p_hand_id;
      return;
    end if;

    v_next := case v_hand.street
                when 'preflop' then 'flop'
                when 'flop' then 'turn'
                when 'turn' then 'river'
              end;

    -- New street: clear per-street state.
    update public.hands
       set street = v_next, current_bet = 0,
           last_raise = (select big_blind from public.games where id = v_hand.game_id)
     where id = p_hand_id;
    update public.hand_players
       set committed_street = 0, has_acted = false
     where hand_id = p_hand_id and status = 'active';

    -- If fewer than 2 players can still act, no betting — keep advancing.
    select count(*) into v_canact from public.hand_players
     where hand_id = p_hand_id and status = 'active';
    if v_canact >= 2 then
      v_dealer := v_hand.dealer_seat;
      v_first := public._next_active_seat(p_hand_id, v_dealer);
      update public.hands
         set current_turn = (select player_id from public.hand_players where hand_id = p_hand_id and seat = v_first)
       where id = p_hand_id;
      return;
    end if;
    -- else: loop to advance to the next street automatically
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- declare_winners: host names the winning seat(s) at showdown; split the pot.
-- ---------------------------------------------------------------------------
create or replace function public.declare_winners(p_hand_id uuid, p_winner_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hand public.hands;
  v_game public.games;
begin
  select * into v_hand from public.hands where id = p_hand_id;
  if v_hand.id is null then raise exception 'Hand not found'; end if;

  select * into v_game from public.games where id = v_hand.game_id;
  if v_game.host_id <> auth.uid() then raise exception 'Only the host can declare winners'; end if;
  if v_hand.status = 'complete' then raise exception 'Hand already complete'; end if;

  -- Winners must be players still in the hand.
  if exists (
    select 1 from unnest(p_winner_ids) w
    where not exists (
      select 1 from public.hand_players hp
      where hp.hand_id = p_hand_id and hp.player_id = w and hp.status in ('active', 'all_in'))
  ) then
    raise exception 'Winner must be a player still in the hand';
  end if;

  perform public._award_pot(p_hand_id, p_winner_ids);
end;
$$;

grant execute on function public.declare_winners(uuid, uuid[]) to authenticated;
