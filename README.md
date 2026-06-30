# Poker Ledger

Track home poker games, balances, and exactly who owes whom — a mobile-first
web app (PWA) you can run on your phone or laptop.

This is **Phase 1**: accounts, player tracking, manual game recording, and the
Account Sheet (lifetime net P/L + settle-up). Live games, QR-code joining, chip
tracking, and dealing come in later phases (see
`~/.claude/plans/i-had-an-idea-precious-frost.md` for the full roadmap).

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind v4**
- **Supabase** — Postgres, Auth (email + password), Row-Level Security
- PWA manifest for "Add to Home Screen"

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Once created, click **Connect** (top bar) → **App Frameworks** (or
   **Project Settings → API**) and copy:
   - **Project URL**
   - the **publishable key** (`sb_publishable_...`)

   > Note: Supabase's Connect screen also offers an "Add files" step that drops
   > client helpers into `utils/supabase/`. **Skip it** — this project already
   > has equivalents in `lib/supabase/`. You only need the env values.

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
```

(If your project still shows a legacy **anon** key instead, you can set
`NEXT_PUBLIC_SUPABASE_ANON_KEY` — the app accepts either.)

### 3. Apply the database schema

In the Supabase dashboard → **SQL Editor**, paste and run **each migration in
order**:

1. [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) —
   tables, Row-Level Security, and the signup trigger.
2. [`supabase/migrations/0002_live_games.sql`](supabase/migrations/0002_live_games.sql)
   — live games: join codes, the lobby roster, join RPCs, and realtime.

### 4. Auth settings

- **Disable email confirmation (recommended for testing):**
  **Authentication → Sign In / Providers → Email → turn off "Confirm email"**
  so you can sign up and log in immediately.
- **Enable anonymous sign-ins (required for guest join):**
  **Authentication → Sign In / Providers → turn on "Anonymous sign-ins"**.
  This is how guests join a game without an account (and can claim their history
  later).

### 5. Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To test on your phone,
visit `http://<your-laptop-ip>:3000` on the same Wi-Fi, or deploy a preview to
Vercel.

## How it works (Phase 1)

- **Sign up / log in** — your password protects your identity (no one can be you).
- **Profile** — set a name and a default nickname (used at the table later).
- **Players** — add the people you play with (they don't need accounts yet).
- **Record a game** — enter each player's buy-in and cash-out; a live check
  flags if cash-outs don't equal buy-ins.
- **Account Sheet** — lifetime net per player, current "owed/owes" balance after
  settlements, an auto-computed **settle-up** plan (fewest payments), and full
  game history. "Mark paid" records a settlement and updates balances.

## Live games (Phase 2)

- **Start a live game** (dashboard → "Start live game") — generates a join
  **code**, a shareable **link**, and a **QR code** in the lobby.
- **Join** at `/join/<code>` (scan the QR or open the link):
  - **Logged-in players** are auto-approved (their login proves who they are).
  - **Guests** pick a nickname and join via an anonymous session, landing in a
    **pending** state until the host approves them.
- **Lobby** (host) — see players arrive in realtime, **approve/reject** guests,
  then **Start** the game.
- **End game → record results** — enter each player's buy-in/cash-out, map them
  to a ledger player (existing or new), and it writes straight into the Account
  Sheet from Phase 1.

## Deploy

Push to GitHub and import into [Vercel](https://vercel.com/new). Add the two
`NEXT_PUBLIC_SUPABASE_*` environment variables in the Vercel project settings.
The Supabase backend is already hosted.

## Roadmap

- **Phase 3** — live Chip Tracker (digital chips, physical cards).
- **Phase 4** — Chip Counter (manual entry).
- **Phase 5** — Dealer + full PokerNow-style play.
