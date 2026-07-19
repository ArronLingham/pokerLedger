-- Poker Ledger — Phase 5: Digital Dealer (Cards + Chips)
-- Adds deck, board, and hole cards to the database schema.
-- Updates start_hand and _advance_street to manage digital cards.

alter table public.games
  add column if not exists digital_cards boolean not null default false;

alter table public.hands
  add column if not exists deck text[] not null default '{}',
  add column if not exists board text[] not null default '{}';

alter table public.hand_players
  add column if not exists hole_cards text[];

-- Replace start_hand to handle digital cards dealing
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
  
  -- digital cards variables
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
    
  -- Generate shuffled deck if digital cards mode is enabled
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
                            current_bet, last_raise, pot, deck, board)
  values (p_game_id, v_handno, v_dealer, 'preflop', 'betting',
          v_game.big_blind, v_game.big_blind, 0, v_deck, '{}'::text[])
  returning id into v_hand_id;

  -- Seat the eligible players into the hand.
  insert into public.hand_players (hand_id, player_id, seat, committed, committed_street, status, has_acted)
  select v_hand_id, gp.id, gp.seat, 0, 0, 'active', false
    from public.game_players gp
   where gp.game_id = p_game_id and gp.status = 'approved' and gp.stack > 0;

  -- Deal hole cards if digital
  if v_game.digital_cards then
    for r in select id from public.hand_players where hand_id = v_hand_id order by seat loop
      v_hole := v_deck[1:2];
      v_deck := v_deck[3:array_length(v_deck, 1)];
      update public.hand_players set hole_cards = v_hole where id = r.id;
    end loop;
    
    -- Update remaining deck
    update public.hands set deck = v_deck where id = v_hand_id;
  end if;

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

-- Replace _advance_street to pop community cards
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
  -- First trigger refunds for any uncalled bets before advancing
  perform public._refund_uncalled_bets(p_hand_id);

  loop
    select * into v_hand from public.hands where id = p_hand_id;
    select * into v_game from public.games where id = v_hand.game_id;

    if v_hand.street = 'river' then
      update public.hands set status = 'awaiting_showdown', current_turn = null where id = p_hand_id;
      return;
    end if;

    v_next := case v_hand.street
                when 'preflop' then 'flop'
                when 'flop' then 'turn'
                when 'turn' then 'river'
              end;

    -- Handle community cards if digital
    v_deck := v_hand.deck;
    v_board := v_hand.board;
    if v_game.digital_cards then
      if v_next = 'flop' then
        v_deal := v_deck[1:3];
        v_deck := v_deck[4:array_length(v_deck, 1)];
      elsif v_next = 'turn' or v_next = 'river' then
        v_deal := v_deck[1:1];
        v_deck := v_deck[2:array_length(v_deck, 1)];
      end if;
      v_board := v_board || v_deal;
    end if;

    -- New street: clear per-street state.
    update public.hands
       set street = v_next, current_bet = 0,
           last_raise = v_game.big_blind,
           deck = coalesce(v_deck, '{}'::text[]),
           board = coalesce(v_board, '{}'::text[])
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
