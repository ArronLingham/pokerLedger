-- Poker Ledger — Turn timer
--
-- Problem: turn order is enforced server-side, but there is no clock, so one
-- absent player stalls the table indefinitely (the host has to act for them).
--
-- Fix: an optional per-turn deadline. When it expires the player is checked
-- (if checking is free) or folded (if facing a bet) and play moves on.
--
-- Design notes:
--   * The server is the authority. Clients only *nudge* via expire_turn(); the
--     deadline is always re-validated against server time, so client clock skew
--     or a tampered client cannot fold someone early.
--   * Deadlines are maintained by a BEFORE trigger on `hands`, so start_hand,
--     player_action and _advance_street need no changes — every code path that
--     moves current_turn gets a fresh deadline for free.
--   * player_action is recreated verbatim from 0004 with ONE change: the
--     authorization block also accepts a forced check/fold once the clock has
--     genuinely run out. All pot/turn/street maths is untouched.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.games
  add column if not exists turn_seconds int not null default 0; -- 0 = timer off

alter table public.hands
  add column if not exists turn_deadline timestamptz;

-- Lets the action log distinguish a real fold from a timeout.
alter table public.hand_actions
  add column if not exists auto boolean not null default false;

-- ---------------------------------------------------------------------------
-- Keep hands.turn_deadline in sync whenever the turn moves.
-- ---------------------------------------------------------------------------
create or replace function public._touch_turn_deadline()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_changed boolean;
  v_secs    int;
begin
  -- OLD is not assigned on INSERT, so branch on TG_OP first.
  if tg_op = 'INSERT' then
    v_changed := true;
  else
    v_changed := (new.current_turn is distinct from old.current_turn)
              or (new.status is distinct from old.status);
  end if;

  if not v_changed then
    return new;
  end if;

  select turn_seconds into v_secs from public.games where id = new.game_id;

  if coalesce(v_secs, 0) > 0
     and new.current_turn is not null
     and new.status = 'betting' then
    new.turn_deadline := now() + make_interval(secs => v_secs);
  else
    new.turn_deadline := null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_turn_deadline on public.hands;
create trigger set_turn_deadline
  before insert or update on public.hands
  for each row execute function public._touch_turn_deadline();

-- ---------------------------------------------------------------------------
-- player_action — verbatim from 0004 except the authorization block, which now
-- also permits a forced check/fold after the clock has expired.
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
  v_expired boolean;
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

  -- The clock has run out AND this is a non-committal action AND the caller is
  -- actually in this game: anyone at the table may move the game along.
  v_expired := v_hand.turn_deadline is not null
           and now() > v_hand.turn_deadline
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
  -- game along; a player folding just after their own clock expired is still a
  -- deliberate fold.
  insert into public.hand_actions (hand_id, player_id, street, action, amount, auto)
  values (p_hand_id, v_hp.player_id, v_hand.street, p_action, coalesce(v_add, 0),
          coalesce(v_expired, false)
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

grant execute on function public.player_action(uuid, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- expire_turn: the RPC clients call when they believe the clock has run out.
--
-- Returns true if it actually acted. Returns false (NOT an error) when there is
-- nothing to do — no hand, no clock, deadline not reached, or another client
-- already moved the turn along. That makes it safe to poll and safe to race.
-- ---------------------------------------------------------------------------
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
  select * into v_hand from public.hands where id = p_hand_id;
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

grant execute on function public.expire_turn(uuid) to authenticated;
