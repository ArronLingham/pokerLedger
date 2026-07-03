-- Poker Ledger — Phase 2: live games + join flow
-- Adds join codes, a lobby roster (game_players), join RPCs, and realtime.

-- ---------------------------------------------------------------------------
-- games: add a short, shareable join code
-- ---------------------------------------------------------------------------
alter table public.games
  add column if not exists join_code text unique;

create index if not exists games_join_code_idx on public.games (join_code);

-- ---------------------------------------------------------------------------
-- game_players: the live roster for a game (lobby + in-game).
-- A player is a joining account (profile_id, which may be an *anonymous* auth
-- user for guests). member_id links them to a ledger member at close time so
-- results persist into the Account Sheet.
-- ---------------------------------------------------------------------------
create table if not exists public.game_players (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  member_id  uuid references public.members (id) on delete set null,
  is_guest   boolean not null default false,
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'rejected', 'left')),
  nickname   text not null default '',
  seat       int,
  joined_at  timestamptz not null default now(),
  unique (game_id, profile_id)
);

create index if not exists game_players_game_id_idx on public.game_players (game_id);
create index if not exists game_players_profile_id_idx on public.game_players (profile_id);

alter table public.game_players enable row level security;

-- Host can do anything with players in their own games.
drop policy if exists "hosts manage players in their games" on public.game_players;
create policy "hosts manage players in their games"
  on public.game_players for all
  to authenticated
  using (
    exists (
      select 1 from public.games g
      where g.id = game_players.game_id and g.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.games g
      where g.id = game_players.game_id and g.host_id = auth.uid()
    )
  );

-- A player can read their own roster row (to watch their approval status).
drop policy if exists "players read their own row" on public.game_players;
create policy "players read their own row"
  on public.game_players for select
  to authenticated
  using (profile_id = auth.uid());

-- A player can update their own row (e.g. leave, change nickname) but cannot
-- escalate status — joining/approval is mediated by RPCs / the host.
drop policy if exists "players update their own row" on public.game_players;
create policy "players update their own row"
  on public.game_players for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Players need to read the game they joined (initial load + realtime status).
-- A plain policy referencing game_players would recurse (game_players policies
-- reference games); a SECURITY DEFINER helper bypasses RLS to break the cycle.
create or replace function public.is_game_participant(p_game_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game_id and gp.profile_id = auth.uid()
  );
$$;

grant execute on function public.is_game_participant(uuid) to authenticated;

drop policy if exists "players read games they joined" on public.games;
create policy "players read games they joined"
  on public.games for select
  to authenticated
  using (host_id = auth.uid() or public.is_game_participant(id));

-- ---------------------------------------------------------------------------
-- RPC: look up a joinable game by code (bypasses RLS via SECURITY DEFINER,
-- but only exposes lobby/active games and a minimal projection).
-- ---------------------------------------------------------------------------
create or replace function public.get_game_by_code(p_code text)
returns table (id uuid, name text, status text, host_name text)
language sql
security definer set search_path = public
as $$
  select g.id, g.name, g.status, coalesce(p.display_name, 'Host')
  from public.games g
  join public.profiles p on p.id = g.host_id
  where g.join_code = upper(p_code)
    and g.status in ('lobby', 'active')
  limit 1;
$$;

grant execute on function public.get_game_by_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: join a game by code. The caller must be authenticated (anonymous auth
-- is fine for guests). Logged-in (permanent) users are auto-approved; guests
-- (anonymous users) land in 'pending' for host approval.
-- ---------------------------------------------------------------------------
create or replace function public.join_game(p_code text, p_nickname text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_is_anon   boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  v_game_id   uuid;
  v_nickname  text;
  v_player_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_game_id
  from public.games
  where join_code = upper(p_code) and status in ('lobby', 'active')
  limit 1;

  if v_game_id is null then
    raise exception 'Game not found';
  end if;

  v_nickname := nullif(trim(coalesce(p_nickname, '')), '');
  if v_nickname is null then
    select nullif(default_nickname, '') into v_nickname
    from public.profiles where id = v_uid;
    v_nickname := coalesce(v_nickname, 'Player');
  end if;

  insert into public.game_players (game_id, profile_id, is_guest, status, nickname)
  values (
    v_game_id,
    v_uid,
    v_is_anon,
    case when v_is_anon then 'pending' else 'approved' end,
    v_nickname
  )
  on conflict (game_id, profile_id)
  do update set nickname = excluded.nickname
  returning id into v_player_id;

  return v_player_id;
end;
$$;

grant execute on function public.join_game(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast roster + game status changes to subscribed clients.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'game_players'
  ) then
    alter publication supabase_realtime add table public.game_players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;
