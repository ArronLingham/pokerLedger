# Poker Ledger — Handoff Document

This document summarizes the architecture, features, and technical decisions made during the development of Poker Ledger (Phases 1 through 5).

## 1. Project Overview

Poker Ledger is a mobile-first web app (PWA) designed to track home poker games, manage player balances (who owes whom), and run live digital games. Over 5 phases of development, it evolved from a simple ledger into a fully-fledged, server-authoritative Texas Hold'em betting engine with digital card dealing and automatic hand evaluation.

### Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4.
- **Backend/Database**: Supabase (PostgreSQL, Auth, Row-Level Security, Realtime).
- **Deployment**: Vercel (Frontend) + Supabase Cloud (Backend).
- **Evaluation Engine**: `pokersolver` (npm package used in Next.js Server Actions).

## 2. Completed Phases & Features

### Phase 1: Accounts & Ledger
- **Player Profiles & Members**: Users can sign up, create a profile, and add local "members" to track the people they play with.
- **Manual Game Recording**: Hosts can manually input buy-ins and cash-outs for a finished game. The app validates that total cash-outs equal total buy-ins.
- **Account Sheet**: Calculates lifetime net profit/loss for every player, computes a "settle-up" plan (who owes whom with the fewest transactions), and allows marking debts as paid.

### Phase 2: Live Games & Lobbies
- **Lobby System**: Hosts can create a live game, generating a unique join code, shareable link, and a QR code.
- **Guest Joins**: Players can join via their own devices. Logged-in players are auto-approved, while guests (anonymous Auth) join a pending queue for the host to approve or reject.
- **Realtime Sync**: Supabase Realtime channels broadcast lobby status changes (joined, approved, rejected) to all connected clients instantly.

### Phase 3: Chip Tracker & Betting Engine
- **Server-Authoritative Engine**: A robust state machine built entirely in PostgreSQL RPCs (`SECURITY DEFINER`). Clients cannot cheat; all mutations are validated by the database.
- **Structured Betting**: The engine handles dealer button rotation, posting small/big blinds, turn order enforcement, and tracks all actions (Fold, Check, Call, Raise, All-in).
- **Realtime Table UI**: Players act on their own phones while viewing everyone's stacks and the pot.

### Phase 4: Chip Counter & Side Pots
- **Side Pots Calculation**: Deep improvements to the betting engine to correctly calculate multi-way all-ins, track eligibility per player, and automatically refund uncalled bets.
- **Chip Counter UI**: A visual modal integrated into the buy-in/cash-out screens and the host table. Hosts can configure chip denominations (e.g., Red=$5, Blue=$1), and players/hosts can tap to tally exact stack values rather than doing math in their heads.

### Phase 5: Digital Dealer
- **Digital Cards Toggle**: Hosts can toggle the game between "Physical Cards" (app only tracks chips) and "Digital Cards" (app deals cards).
- **Deck & Dealing**: The PostgreSQL engine shuffles a cryptographically random 52-card deck and assigns 2 hidden hole cards to each active player.
- **Hold-to-Peek**: A mobile-friendly UI interaction where players must press and hold the screen to peek at their hidden hole cards, preventing neighbors from seeing them.
- **Auto-Evaluation**: At showdown, a Next.js Server Action utilizes `pokersolver` to read the community board and player hole cards, evaluating the best 5-card Texas Hold'em hand to automatically declare the winner(s) and split pots accurately.

## 3. Database Architecture

The core of the app lives in Supabase PostgreSQL. Key migrations included:

1. **`0001_init.sql`**: Profiles, members, games, game_results, settlements.
2. **`0002_live_games.sql`**: Added `status` and `join_code` to games, plus `game_players` for live rosters.
3. **`0003_chip_tracker.sql`**: Created the `hands` and `hand_players` tables. Introduced the core `start_hand` and `player_action` RPCs.
4. **`0004_betting_engine.sql`**: Refined betting logic (min-raise calculations, street advancement).
5. **`0005_side_pots.sql`**: Added `_refund_uncalled_bets` and modified `declare_winners` to accept structured side-pot arrays.
6. **`0006_digital_cards.sql`**: Added `digital_cards` to games, `deck`/`board` to hands, and `hole_cards` to hand_players. Updated dealing and street advancement logic.

All betting logic bypasses direct client inserts. Clients subscribe to changes on `hands` and `hand_players` via Supabase Realtime, and trigger state changes exclusively via `supabase.rpc()`.

## 4. Key Files & Directories

- **`supabase/migrations/`**: Contains all 6 sequential SQL migrations defining the schema, RLS, and RPCs.
- **`app/(app)/games/actions.ts`**: Contains Server Actions for creating games, joining, closing out the ledger, and the `evaluateShowdown` logic.
- **`components/live/`**:
  - `use-live-game.ts`: The central hook that subscribes to Supabase Realtime and manages the live table state.
  - `table-board.tsx`: The UI for the poker table (seats, stacks, dealer button, community cards).
  - `action-bar.tsx`: The controls for players to check, call, raise, or fold on their turn.
- **`components/chip-counter.tsx`**: The reusable chip tallying modal.
- **`components/playing-card.tsx`**: The UI component for rendering digital playing cards.
- **`lib/ledger.ts`**: Utilities for formatting money, chips, and calculating the settle-up debt resolution matrix.

## 5. Maintenance & Next Steps

The application is feature-complete per the original roadmap. If you intend to make future updates:
- **Database changes**: Always create a new migration in `supabase/migrations/` rather than editing existing ones, and apply them via the Supabase Dashboard.
- **Adding new features**: The `useLiveGame` hook is the source of truth for the frontend. Any new realtime features should hook into the existing channel subscriptions there.
