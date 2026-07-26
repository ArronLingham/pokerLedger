-- Poker Ledger — Card privacy hardening
--
-- Problem: `hand_players.hole_cards` and `hands.deck` were readable by every
-- participant (both tables grant participant SELECT, and clients fetch `*`).
-- Any player could read opponents' hole cards and the undealt deck — i.e. the
-- upcoming turn/river — from the network tab.
--
-- Fix: move both to private tables with RLS enabled and NO policies, so PostgREST
-- can never return them (only SECURITY DEFINER functions can read them). The
-- community `board` stays public on `hands`. Cards reach clients only via:
--   * get_my_hole_cards(hand_id)      -> only the caller's own cards
--   * get_showdown_cards(hand_id)     -> at showdown, only contested hands
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Private storage
-- ---------------------------------------------------------------------------
create table if not exists public.hand_deck (
  hand_id uuid primary key references public.hands (id) on delete cascade,
  cards   text[] not null default '{}'
);

create table if not exists public.hand_hole_cards (
  hand_id        uuid not null references public.hands (id) on delete cascade,
  hand_player_id uuid not null references public.hand_players (id) on delete cascade,
  player_id      uuid not null references public.game_players (id) on delete cascade,
  cards          text[] not null default '{}',
  primary key (hand_id, hand_player_id)
);

create index if not exists hand_hole_cards_player_idx
  on public.hand_hole_cards (player_id);

-- RLS on, deliberately NO policies => unreachable via the REST API.
alter table public.hand_deck enable row level security;
alter table public.hand_hole_cards enable row level security;

revoke all on public.hand_deck from anon, authenticated;
revoke all on public.hand_hole_cards from anon, authenticated;

-- Backfill from the old columns so in-flight hands keep working.
insert into public.hand_deck (hand_id, cards)
select h.id, h.deck from public.hands h
where coalesce(array_length(h.deck, 1), 0) > 0
on conflict (hand_id) do nothing;

insert into public.hand_hole_cards (hand_id, hand_player_id, player_id, cards)
select hp.hand_id, hp.id, hp.player_id, hp.hole_cards
from public.hand_players hp
where coalesce(array_length(hp.hole_cards, 1), 0) > 0
on conflict (hand_id, hand_player_id) do nothing;

-- Drop the leaky columns (data now lives in the private tables).
alter table public.hands drop column if exists deck;
alter table public.hand_players drop column if exists hole_cards;

-- ---------------------------------------------------------------------------
-- start_hand: deal into the private tables.
-- ---------------------------------------------------------------------------
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

grant execute on function public.start_hand(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- _advance_street: burn community cards from the private deck.
-- ---------------------------------------------------------------------------
create or replace function public._advance_street(p_hand_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hand   public.hands;
  v_game   public.games;
  v_next   text;
  v_dealer int;
  v_canact int;
  v_first  int;
  v_deck   text[];
  v_board  text[];
  v_deal   text[];
begin
  loop
    select * into v_hand from public.hands where id = p_hand_id;
    select * into v_game from public.games where id = v_hand.game_id;

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

    v_board := v_hand.board;
    if v_game.digital_cards then
      select cards into v_deck from public.hand_deck where hand_id = p_hand_id;
      v_deck := coalesce(v_deck, '{}'::text[]);
      v_deal := null;
      if v_next = 'flop' then
        v_deal := v_deck[1:3];
        v_deck := v_deck[4:array_length(v_deck, 1)];
      else
        v_deal := v_deck[1:1];
        v_deck := v_deck[2:array_length(v_deck, 1)];
      end if;
      v_board := v_board || coalesce(v_deal, '{}'::text[]);

      update public.hand_deck set cards = coalesce(v_deck, '{}'::text[]) where hand_id = p_hand_id;
    end if;

    update public.hands
       set street = v_next, current_bet = 0,
           last_raise = v_game.big_blind,
           board = coalesce(v_board, '{}'::text[])
     where id = p_hand_id;

    update public.hand_players
       set committed_street = 0, has_acted = false
     where hand_id = p_hand_id and status = 'active';

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
-- Read APIs — the only way cards reach a client.
-- ---------------------------------------------------------------------------

-- Your own hole cards, and only yours.
create or replace function public.get_my_hole_cards(p_hand_id uuid)
returns text[]
language plpgsql stable security definer set search_path = public
as $$
declare
  v_cards text[];
begin
  select hc.cards into v_cards
    from public.hand_hole_cards hc
    join public.game_players gp on gp.id = hc.player_id
   where hc.hand_id = p_hand_id
     and gp.profile_id = auth.uid();
  return coalesce(v_cards, '{}'::text[]);
end;
$$;

grant execute on function public.get_my_hole_cards(uuid) to authenticated;

-- Cards revealed at showdown: participants only, only once the hand has reached
-- showdown, and only for hands that actually got there (folded hands stay
-- mucked). If everyone but one player folded, nothing is revealed.
create or replace function public.get_showdown_cards(p_hand_id uuid)
returns table (player_id uuid, cards text[])
language plpgsql stable security definer set search_path = public
as $$
declare
  v_hand    public.hands;
  v_is_host boolean;
  v_contested int;
begin
  select * into v_hand from public.hands where id = p_hand_id;
  if v_hand.id is null then return; end if;

  select (g.host_id = auth.uid()) into v_is_host
    from public.games g where g.id = v_hand.game_id;

  if not coalesce(v_is_host, false) and not public.is_game_participant(v_hand.game_id) then
    return;
  end if;

  if v_hand.status not in ('awaiting_showdown', 'complete') then
    return;
  end if;

  -- Only reveal when 2+ players are still in (a real showdown).
  select count(*) into v_contested
    from public.hand_players
   where hand_id = p_hand_id and status in ('active', 'all_in');
  if v_contested < 2 then return; end if;

  return query
    select hc.player_id, hc.cards
      from public.hand_hole_cards hc
      join public.hand_players hp
        on hp.hand_id = hc.hand_id and hp.player_id = hc.player_id
     where hc.hand_id = p_hand_id
       and hp.status in ('active', 'all_in');
end;
$$;

grant execute on function public.get_showdown_cards(uuid) to authenticated;

-- Host-only: hole cards for evaluation at showdown (used by evaluateShowdown).
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

  return query
    select hc.player_id, hc.cards
      from public.hand_hole_cards hc
      join public.hand_players hp
        on hp.hand_id = hc.hand_id and hp.player_id = hc.player_id
     where hc.hand_id = p_hand_id
       and hp.status in ('active', 'all_in');
end;
$$;

grant execute on function public.get_hand_cards_for_eval(uuid) to authenticated;
