# Demo-readiness validation

Validated on September 14, 2026 against the configured development Supabase project.

## Automated checks

- ESLint completed without warnings.
- The Next.js 16.3.5 production build and TypeScript checks completed successfully.
- `npm audit` reported zero known dependency vulnerabilities after the framework update.
- All 11 betting-engine scenarios passed, including chip conservation, folds, all-ins, uneven side pots, card privacy, mucked hands and turn expiry.
- The security and closeout suite passed checks for guest self-approval, chip editing, internal helper access, premature card evaluation, roster validation, foreign members, rollback and concurrent close attempts.

## Browser checks

- Private pages redirect unsigned-in visitors to login.
- A guest can join independently, appears in the host approval queue, and receives approval without refreshing.
- A digital hand appears in both browser sessions.
- The card-peek control is keyboard accessible and no longer covers betting controls.
- The host cannot open closeout while a hand is unfinished.
- The seeded ledger renders balanced fictional history and settlement suggestions.

## Limits

This is a focused portfolio review rather than exhaustive production certification. It does not include load testing, every browser/device, offline operation, full accessibility conformance, network-failure recovery or complete coverage of every poker edge case.
