# Release checklist — pilot v0.1

## Gates (all must be ✅ before go-live)

| # | Gate | How | Status |
|---|---|---|---|
| G1 | CI green on `main` (lint, typecheck, format, unit, integration, build, secret scan, E2E) | GitHub Actions | ✅ locally (26 E2E, 75 integration, 99 unit) — CI runs on push |
| G2 | `pnpm audit --prod` clean | run before tagging | ✅ 2026-09-11: no known vulnerabilities |
| G3 | Production env vars set on Vercel; `/api/health` shows the intended providers | `docs/runbooks/production-setup.md` §2 | ⏳ needs owner keys |
| G4 | The readiness interview validated on staging with the real officer (`INTERVIEW_PROVIDER=claude`): a full Thai session ends with a verdict and a sensible debrief | real session | ⏳ owner walkthrough |
| G5 | Spike S2 — Thai TTS voice chosen | listen on staging | ⏳ needs `ELEVENLABS_API_KEY` |
| G6 | Spike S4 — extraction accuracy on the real certificate | `node scripts/spike-extract.mts <pdf>` | ⏳ needs `ANTHROPIC_API_KEY` |
| G7 | Owner content loaded: study cards (`pnpm content:starter`, D81), approved question bank, policy settings | script + admin UI | ⏳ owner |
| G8 | Name-card design replaces `placeholder-v1` | `lib/integrations/pdf/name-card.tsx` | ⏳ owner design |
| G9 | The officer persona reviewed by the owner on a real transcript | `lib/integrations/interview/claude.ts` | ⏳ owner review |
| G10 | UAT script signed off (`docs/uat-script.md`) | staging | ⏳ |
| G11 | Security checklist deferred items decided (CSP, rate limiting) | `docs/security-checklist.md` #15–#17 | ⏳ decide before public exposure |
| G12 | Uptime monitor on `/api/health` | external monitor | ⏳ |

## Go-live steps

1. Tag: `git tag v0.1.0 && git push --tags`.
2. Vercel: promote the tagged deployment to Production; confirm Cron Jobs lists `/api/cron/notifications`.
3. Supabase: confirm sign-ups disabled, backups on.
4. Run the smoke test (`production-setup.md` §5) with a throwaway learner; delete it afterwards.
5. Announce pilot start; hand learners their login ids and temporary passwords through the agreed private channel (never email to the internal domain — it does not receive mail).

## Post-launch (first two weeks)

- Daily operations checks (`docs/runbooks/operations.md`).
- Collect UAT feedback; log decisions in `docs/decisions-log.md`.
- Backlog candidates already identified: phone modality for calls, retention automation, CSP, app-level rate limiting, admin roles split, transcript scoring/rubric.
