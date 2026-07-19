-- Poker Ledger — Phase 3b: Multi-way all-in side pots & uncalled bet refunds
-- Refined side pot partitioning algorithm, automated uncalled bet refunds,
-- and JSON-driven per-pot winner declaration.

-- ---------------------------------------------------------------------------
-- Helper: refund any uncalled bet to the highest committed player.
-- Called automatically when a hand reaches 'awaiting_showdown'.
-- ---------------------------------------------------------------------------
create or replace function public._refund_uncalled_bets(p_hand_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_highest_committed numeric(12, 2);
  v_second_committed numeric(12, 2);
  v_highest_pid uuid;
  v_refund numeric(12, 2);
begin
  -- Find the highest committed player for this hand
  select player_id, committed into v_highest_pid, v_highest_committed
    from public.hand_players
   where hand_id = p_hand_id
   order by committed desc limit 1;

  if v_highest_pid is null or v_highest_committed is null or v_highest_committed = 0 then
    return;
  end if;

  -- Find the second highest committed amount (including folded players)
  select coalesce(committed, 0) into v_second_committed
    from public.hand_players
   where hand_id = p_hand_id and player_id <> v_highest_pid
   order by committed desc limit 1;

  if v_highest_committed > v_second_committed then
    v_refund := v_highest_committed - v_second_committed;

    -- Return the uncalled chips to stack
    update public.game_players
       set stack = stack + v_refund
     where id = v_highest_pid;

    -- Adjust hand_players record
    update public.hand_players
       set committed = committed - v_refund,
           committed_street = greatest(0, committed_street - v_refund)
     where hand_id = p_hand_id and player_id = v_highest_pid;

    -- Adjust total pot in hands
    update public.hands
       set pot = greatest(0, pot - v_refund)
     where id = p_hand_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper: calculate active pot layers (Main Pot + Side Pots) & eligibility.
-- Returns table of pots: pot_index, amount, eligible_player_ids.
-- ---------------------------------------------------------------------------
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

grant execute on function public.get_side_pots(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Update _advance_street: automatically refund uncalled bets when entering showdown.
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
      perform public._refund_uncalled_bets(p_hand_id);
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
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Update declare_winners: per-side-pot winner declaration via JSON array.
-- Drop old signature first if exists.
-- ---------------------------------------------------------------------------
drop function if exists public.declare_winners(uuid, uuid[]);

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
  select * into v_hand from public.hands where id = p_hand_id;
  if v_hand.id is null then raise exception 'Hand not found'; end if;

  select * into v_game from public.games where id = v_hand.game_id;
  if v_game.host_id <> auth.uid() then raise exception 'Only the host can declare winners'; end if;
  if v_hand.status = 'complete' then raise exception 'Hand already complete'; end if;

  for v_pots in
    select * from public.get_side_pots(p_hand_id)
  loop
    v_winner_ids := array[]::uuid[];
    v_pot_found := false;

    -- Look up this pot_index in p_winners
    for v_item in select * from jsonb_array_elements(p_winners)
    loop
      if (v_item->>'pot_index')::int = v_pots.pot_index then
        select array_agg(x::uuid) into v_winner_ids
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

grant execute on function public.declare_winners(uuid, jsonb) to authenticated;
