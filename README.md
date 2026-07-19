# Poker Ledger

Track home poker games, balances, and exactly who owes whom — a mobile-first
web app (PWA) you can run on your phone or laptop.

This app is **feature-complete (Phases 1 through 5)**: accounts, player tracking, manual game recording, the Account Sheet (lifetime net P/L + settle-up), live games with QR-code joining, a full realtime betting engine with side pots, and a fully digital dealing mode.

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
3. [`supabase/migrations/0003_chip_tracker.sql`](supabase/migrations/0003_chip_tracker.sql)
   — chip tracker: stacks/blinds/button, `hands` + `hand_players`, realtime.
4. [`supabase/migrations/0004_betting_engine.sql`](supabase/migrations/0004_betting_engine.sql)
   — the betting engine RPCs (`start_hand`, `player_action`, `declare_winners`).
5. [`supabase/migrations/0005_side_pots.sql`](supabase/migrations/0005_side_pots.sql)
   — side pot calculation and uncalled bet refunds.
6. [`supabase/migrations/0006_digital_cards.sql`](supabase/migrations/0006_digital_cards.sql)
   — digital cards mode (deck, board, hole cards) and automatic hand evaluation.

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

## Chip Tracker (Phase 3)

Once a game is **active**, the host opens the **table** and taps **Deal next
hand**; players act on their own phones (fold/check/call/bet/raise/all-in) in
turn, with blinds, the dealer button, and betting rounds enforced. The betting engine uses Postgres RPCs for strict server-side validation. Ending the game pre-fills the results form from each player's tracked stack.

## Advanced Engine & Digital Cards (Phases 4 & 5)

- **Chip Counter (Phase 4)** — A visual modal that lets players/host calculate exact chip values (e.g. 5 reds, 2 blues) using predefined chip denominations.
- **Side Pots (Phase 4)** — If a player goes all-in, the engine correctly handles multiple side pots and uncalled bet refunds.
- **Digital Cards (Phase 5)** — Play a full game of Texas Hold'em without physical cards! The app shuffles a 52-card deck, deals 2 hole cards to each player (hold-to-peek), and deals the community cards. At showdown, the app automatically evaluates the winning hands using standard poker rules and awards the pots.

Verify the engine with the harness (needs all migrations applied and
"Confirm email" off):

```bash
node scripts/engine-test.mjs
```

## Deploy

Push to GitHub and import into [Vercel](https://vercel.com/new). Add the two
`NEXT_PUBLIC_SUPABASE_*` environment variables in the Vercel project settings.
The Supabase backend is already hosted.

## Roadmap

- [x] **Phase 1** — Accounts, player profiles, Account Sheet (P/L + settle-up).
- [x] **Phase 2** — Live games (join by QR/code, lobby, anonymous guests).
- [x] **Phase 3** — Chip Tracker (betting engine, real-time actions).
- [x] **Phase 4** — Chip Counter UI & Side Pots logic.
- [x] **Phase 5** — Digital Dealer (server-side dealing and auto-evaluation).
