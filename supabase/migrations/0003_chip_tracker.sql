-- Poker Ledger — Phase 3: Chip Tracker (structured betting)
-- Digital chips for games with physical cards. Adds stacks/blinds/button and a
-- per-hand betting model. The engine RPCs live in 0004.

-- ---------------------------------------------------------------------------
-- games: blinds, dealer button, optional chip denominations
-- ---------------------------------------------------------------------------
alter table public.games
  add column if not exists small_blind numeric(12, 2) not null default 1,
  add column if not exists big_blind numeric(12, 2) not null default 2,
  add column if not exists dealer_seat int,
  add column if not exists denominations jsonb;

-- ---------------------------------------------------------------------------
-- game_players: chips carried across hands
-- ---------------------------------------------------------------------------
alter table public.game_players
  add column if not exists buy_in numeric(12, 2) not null default 0,
  add column if not exists stack numeric(12, 2) not null default 0;

-- ---------------------------------------------------------------------------
-- hands: one row per dealt hand
-- ---------------------------------------------------------------------------
create table if not exists public.hands (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games (id) on delete cascade,
  hand_number  int not null default 1,
  dealer_seat  int not null,
  street       text not null default 'preflop'
               check (street in ('preflop', 'flop', 'turn', 'river')),
  status       text not null default 'betting'
               check (status in ('betting', 'awaiting_showdown', 'complete')),
  current_turn uuid references public.game_players (id) on delete set null,
  current_bet  numeric(12, 2) not null default 0,
  last_raise   numeric(12, 2) not null default 0,
  pot          numeric(12, 2) not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists hands_game_id_idx on public.hands (game_id);
create index if not exists hands_game_status_idx on public.hands (game_id, status);

-- ---------------------------------------------------------------------------
-- hand_players: a player's involvement in a single hand
-- ---------------------------------------------------------------------------
create table if not exists public.hand_players (
  id               uuid primary key default gen_random_uuid(),
  hand_id          uuid not null references public.hands (id) on delete cascade,
  player_id        uuid not null references public.game_players (id) on delete cascade,
  seat             int not null,
  committed        numeric(12, 2) not null default 0, -- total this hand (side pots)
  committed_street numeric(12, 2) not null default 0, -- this street
  status           text not null default 'active'
                   check (status in ('active', 'folded', 'all_in')),
  has_acted        boolean not null default false,
  unique (hand_id, player_id)
);

create index if not exists hand_players_hand_id_idx on public.hand_players (hand_id);

-- ---------------------------------------------------------------------------
-- hand_actions: append-only feed of what happened (for the UI log)
-- ---------------------------------------------------------------------------
create table if not exists public.hand_actions (
  id         uuid primary key default gen_random_uuid(),
  hand_id    uuid not null references public.hands (id) on delete cascade,
  player_id  uuid references public.game_players (id) on delete set null,
  street     text not null,
  action     text not null,
  amount     numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists hand_actions_hand_id_idx on public.hand_actions (hand_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.hands enable row level security;
alter table public.hand_players enable row level security;
alter table public.hand_actions enable row level security;

-- Players in a game can see everyone's stacks (previously own-row only).
drop policy if exists "participants read players in their games" on public.game_players;
create policy "participants read players in their games"
  on public.game_players for select
  to authenticated
  using (public.is_game_participant(game_id));

-- hands: host manages, participants read.
drop policy if exists "hosts manage hands" on public.hands;
create policy "hosts manage hands"
  on public.hands for all
  to authenticated
  using (
    exists (select 1 from public.games g
            where g.id = hands.game_id and g.host_id = auth.uid())
  )
  with check (
    exists (select 1 from public.games g
            where g.id = hands.game_id and g.host_id = auth.uid())
  );

drop policy if exists "participants read hands" on public.hands;
create policy "participants read hands"
  on public.hands for select
  to authenticated
  using (public.is_game_participant(game_id));

-- hand_players: host manages, participants read.
drop policy if exists "hosts manage hand_players" on public.hand_players;
create policy "hosts manage hand_players"
  on public.hand_players for all
  to authenticated
  using (
    exists (select 1 from public.hands h join public.games g on g.id = h.game_id
            where h.id = hand_players.hand_id and g.host_id = auth.uid())
  )
  with check (
    exists (select 1 from public.hands h join public.games g on g.id = h.game_id
            where h.id = hand_players.hand_id and g.host_id = auth.uid())
  );

drop policy if exists "participants read hand_players" on public.hand_players;
create policy "participants read hand_players"
  on public.hand_players for select
  to authenticated
  using (
    exists (select 1 from public.hands h
            where h.id = hand_players.hand_id
              and public.is_game_participant(h.game_id))
  );

-- hand_actions: host manages, participants read.
drop policy if exists "hosts manage hand_actions" on public.hand_actions;
create policy "hosts manage hand_actions"
  on public.hand_actions for all
  to authenticated
  using (
    exists (select 1 from public.hands h join public.games g on g.id = h.game_id
            where h.id = hand_actions.hand_id and g.host_id = auth.uid())
  )
  with check (
    exists (select 1 from public.hands h join public.games g on g.id = h.game_id
            where h.id = hand_actions.hand_id and g.host_id = auth.uid())
  );

drop policy if exists "participants read hand_actions" on public.hand_actions;
create policy "participants read hand_actions"
  on public.hand_actions for select
  to authenticated
  using (
    exists (select 1 from public.hands h
            where h.id = hand_actions.hand_id
              and public.is_game_participant(h.game_id))
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'hands'
  ) then
    alter publication supabase_realtime add table public.hands;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'hand_players'
  ) then
    alter publication supabase_realtime add table public.hand_players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'hand_actions'
  ) then
    alter publication supabase_realtime add table public.hand_actions;
  end if;
end $$;
