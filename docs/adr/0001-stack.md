# ADR 0001: Next.js + Supabase + Vercel

**Status:** Accepted (2026-09-11)

**Context.** ASAP pilot for a handful of companies (decision D6). The owner's Supabase, Vercel and GitHub
accounts are already connected. The PRD's hardest requirement is learner isolation (AUTH-003, AC-011).

**Decision.** One Next.js App Router app on Vercel; Supabase Postgres/Auth/Storage per environment.

**Consequences.** Row-Level Security enforces isolation in the database (ADR 0002). Serverless makes
browser-based PDF rendering awkward (spike S3). Nearest Supabase region is Singapore.
