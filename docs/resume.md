# Resume and interview wording

Use only claims that reflect work you understand and can explain. No production usage, latency or adoption metrics are claimed here.

## Project entry

**Poker Ledger | Next.js, React, TypeScript, Tailwind CSS, Supabase, PostgreSQL**

[GitHub](https://github.com/ArronLingham/pokerLedger) · [Demo](https://github.com/ArronLingham/pokerLedger/blob/main/docs/demo/poker-ledger-demo.mp4)

- Built a mobile-first poker management app with authenticated accounts, guest lobbies, realtime game state and persistent player balances using Next.js, TypeScript and Supabase.
- Implemented PostgreSQL betting workflows for turn order, blinds, all-ins and side pots; integrated `pokersolver` for digital-card showdown evaluation.
- Hardened database permissions and transactional game closeout, with integration tests for card access, chip conservation, rollback and concurrent submissions.

## Tailor the emphasis

**Frontend roles:** lead with responsive React components, realtime state, guest approval updates, and mobile card interactions. Explain how you prevent stale asynchronous reads from overwriting newer state.

**Backend roles:** lead with PostgreSQL functions, authentication and row-level authorization, explicit RPC permissions, hand locking, and transactional closeout. Explain why merely hiding controls does not secure an API.

**Full-stack roles:** show the complete join → play → close → settle workflow and explain the responsibilities of the browser, Next.js server and database.

## Interview examples to prepare

- A row policy protected the right user row but allowed edits to sensitive columns. Explain the distinction and the regression test.
- A multi-step closeout could overwrite results or leave partial state. Explain unique mappings, rollback, and concurrent submissions.
- A guest screen used its initial server-rendered status after approval. Explain why the live roster must be the source of truth.
- Private cards require access controls in the database, not just visual hiding in the interface.
- Describe the limits of a trusted host, a pseudorandom shuffle, and greedy settlement suggestions candidly.
