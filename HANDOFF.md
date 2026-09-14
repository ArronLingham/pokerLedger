# Poker Ledger — handoff

The current implementation and tradeoffs are documented in [docs/architecture.md](docs/architecture.md).

- [Setup, features and demo](README.md)
- [Validation performed](docs/validation.md)
- [Demo reproduction](docs/demo/README.md)
- [Resume and interview wording](docs/resume.md)

Database changes belong in new timestamped migrations. Apply them with the Supabase CLI to the intended development project. The migration `20260913120000_demo_readiness.sql` restricts RPC execution, removes player self-edit permission, guards showdown evaluation, serializes hand operations and adds atomic closeout.

The project is a trusted-host home-game app. Do not describe it as cheat-proof, cryptographically shuffled, offline-capable, or guaranteed to minimize settlement payments.
