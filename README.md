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
2. Once created, open **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3. Apply the database schema

In the Supabase dashboard → **SQL Editor**, paste and run the contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). This
creates the tables, Row-Level Security policies, and the trigger that creates a
profile row on signup.

### 4. (Recommended for testing) Disable email confirmation

So you can sign up and log in immediately:
**Authentication → Sign In / Providers → Email → turn off "Confirm email"**.
Leave it on for production if you prefer.

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

## Deploy

Push to GitHub and import into [Vercel](https://vercel.com/new). Add the two
`NEXT_PUBLIC_SUPABASE_*` environment variables in the Vercel project settings.
The Supabase backend is already hosted.

## Roadmap

- **Phase 2** — host creates a game → join via code/link/QR; guests need host
  approval; logged-in players auto-approved.
- **Phase 3** — live Chip Tracker (digital chips, physical cards).
- **Phase 4** — Chip Counter (manual entry).
- **Phase 5** — Dealer + full PokerNow-style play.
