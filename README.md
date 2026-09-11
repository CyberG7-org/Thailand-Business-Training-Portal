# Thailand Business Training & Bank Verification Portal

Provisioned-login training portal: DBD-linked study, quiz, exam, Thai name card, DBD+45-day
bank-verification unlock, Thai Vapi call training. Spec: `docs/superpowers/specs/`.

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
