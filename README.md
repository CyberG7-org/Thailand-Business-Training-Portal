# Thailand Business Training & Bank Verification Portal

Provisioned-login training portal: DBD-linked study, quiz, exam, Thai name card, DBD+45-day
bank-verification unlock, Thai Vapi call training. Spec: `docs/superpowers/specs/`.

## Documentation

| Doc                                 | Purpose                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `docs/superpowers/specs/`           | Foundation spec (P0–P2) and slice specs P3–P11           |
| `docs/decisions-log.md`             | Every product/technical decision (D1–D35)                |
| `docs/adr/`                         | Architecture decision records                            |
| `docs/security-checklist.md`        | Security review verdicts and what verifies each item     |
| `docs/runbooks/production-setup.md` | Supabase + Vercel + provider setup, env vars, smoke test |
| `docs/runbooks/operations.md`       | Monitoring, incidents, data handling, rollback           |
| `docs/uat-script.md`                | Pilot acceptance script (admin, learner, Thai QA)        |
| `docs/release-checklist.md`         | Go-live gates and steps                                  |

All external services sit behind adapters with fake providers, so the full test suite runs
without any API key. `GET /api/health` shows which provider each adapter resolved to.

## Prerequisites

- Node 24, pnpm 11, Docker Desktop (running) for the local Supabase stack.

## Run locally

```bash
pnpm install
pnpm db:start        # local Supabase (Docker)
pnpm db:env          # writes .env.local from the running stack
pnpm db:reset        # applies migrations + seed
pnpm dev             # http://localhost:3000
```

## Tests

```bash
pnpm test:unit
pnpm test:integration   # needs pnpm db:start
pnpm test:e2e           # needs pnpm db:start + built app
```
