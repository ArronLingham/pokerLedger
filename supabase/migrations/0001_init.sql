-- Poker Ledger — Phase 1 schema
-- Accounts, ledger members, games, results, and settlements.
-- Designed to extend cleanly into live-game tooling (Phase 2+).

-- ---------------------------------------------------------------------------
-- profiles: one row per registered account (mirrors auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text not null default '',
  default_nickname text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any authenticated user can read profiles (needed to link a ledger member to
-- a registered friend). Users may only modify their own profile.
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, default_nickname)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'default_nickname', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- members: people tracked in a host's ledger. May or may not be linked to a
-- registered account. Gives a stable identity for lifetime P/L across games.
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists members_host_id_idx on public.members (host_id);

alter table public.members enable row level security;

create policy "hosts manage their own members"
  on public.members for all
  to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- ---------------------------------------------------------------------------
-- games: a recorded poker session owned by a host
-- ---------------------------------------------------------------------------
create table if not exists public.games (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null default '',
  played_on  date not null default current_date,
  status     text not null default 'finished'
             check (status in ('lobby', 'active', 'finished')),
  notes      text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists games_host_id_idx on public.games (host_id);

alter table public.games enable row level security;

create policy "hosts manage their own games"
  on public.games for all
  to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- ---------------------------------------------------------------------------
-- game_results: per-player buy-in / cash-out for a game. net = cash_out - buy_in
-- ---------------------------------------------------------------------------
create table if not exists public.game_results (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.games (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  buy_in    numeric(12, 2) not null default 0,
  cash_out  numeric(12, 2) not null default 0,
  unique (game_id, member_id)
);

create index if not exists game_results_game_id_idx on public.game_results (game_id);
create index if not exists game_results_member_id_idx on public.game_results (member_id);

alter table public.game_results enable row level security;

-- A result is visible/editable only if its game belongs to the current user.
create policy "hosts manage results for their games"
  on public.game_results for all
  to authenticated
  using (
    exists (
      select 1 from public.games g
      where g.id = game_results.game_id and g.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.games g
      where g.id = game_results.game_id and g.host_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- settlements: a recorded payment from one member to another, clearing debt
-- ---------------------------------------------------------------------------
create table if not exists public.settlements (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references public.profiles (id) on delete cascade,
  from_member uuid not null references public.members (id) on delete cascade,
  to_member   uuid not null references public.members (id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0),
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists settlements_host_id_idx on public.settlements (host_id);

alter table public.settlements enable row level security;

create policy "hosts manage their own settlements"
  on public.settlements for all
  to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);
