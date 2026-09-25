# Security checklist (P9 review, 2026-09-11)

Verdict per item of the foundation spec §13 "Security" row plus what the slices added. Each "Verified by" entry is an automated test that runs in CI, unless marked *manual*.

| # | Item | Verdict | Verified by |
|---|---|---|---|
| 1 | Every table has RLS; learners see only their own rows | ✅ | `tests/integration/*.rls.test.ts`, `isolation.test.ts`, `assessment.test.ts`, `calls.test.ts`, `settings.test.ts` |
| 2 | Service-role key never reaches the client bundle | ✅ | `pnpm check:secrets` (`scripts/check-client-secrets.mjs`) after `pnpm build` |
| 3 | IDOR on every id-bearing learner route (quiz/exam attempts, results, calls, cards) | ✅ | `tests/e2e/idor.spec.ts` (404 for foreign ids), RLS integration tests |
| 4 | Admin routes bounce learners; middleware guards `/dashboard` and `/admin` | ✅ | `tests/e2e/auth.spec.ts`, `tests/e2e/idor.spec.ts` |
| 5 | Private buckets only; files served through short-lived signed URLs (DBD docs, study PDFs, TTS cache, name cards, recordings); DBD uploads go browser → bucket under a signed upload URL that only admins can obtain, and the object is verified (PDF magic, 30 MB, record prefix) before it becomes a document (D45) | ✅ | bucket definitions in migrations 0002/0005/0008/0009; signed-URL helpers in `lib/db/*` (300–600 s) |
| 6 | Cron endpoint requires `CRON_SECRET` bearer | ✅ | `tests/e2e/exam.spec.ts`, `idor.spec.ts` |
| 7 | Vapi webhook requires `x-vapi-secret`; deliveries ledgered and idempotent | ✅ | `tests/e2e/bank-call.spec.ts`, `tests/integration/calls.test.ts` |
| 8 | TTS endpoint requires an active session and only synthesizes approved Thai cards | ✅ | `tests/e2e/study.spec.ts`, `idor.spec.ts` |
| 9 | Policy changes only by admins, audited with the real actor | ✅ | `tests/integration/settings.test.ts`, `tests/e2e/admin-settings.spec.ts` |
| 10 | Generic login error (no account enumeration); disabled accounts cannot sign in | ✅ | `tests/e2e/auth.spec.ts`, `admin-users.spec.ts` |
| 11 | Sample certificates with real PII never enter the repo | ✅ | `.gitignore` (`*.pdf`, `*.xlsx`, `.env*`); *manual*: `git ls-files | grep -i pdf` returns only vendored fonts' licence text |
| 12 | Hardening headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) | ✅ | `next.config.ts`; `tests/e2e/idor.spec.ts` |
| 13 | Server actions re-check ownership/gates instead of trusting the client (attempt ownership, bank gate, `call_max_sessions`) | ✅ | `tests/integration/{assessment,exam,calls}.test.ts` |
| 14 | Extraction output is never auto-confirmed; admin review is mandatory | ✅ | `tests/e2e/extraction.spec.ts`, `tests/integration/extraction.test.ts` |
| 14b | AI-generated questions land as drafts only; approval still needs an admin and three languages; generation runs under the admin's own RLS session | ✅ | `tests/integration/question-gen.test.ts`, `tests/e2e/ai-questions.spec.ts` |
| 15 | Content-Security-Policy | ⏳ deferred | Not set for the pilot: `@vapi-ai/web` (Daily WebRTC) and Supabase signed URLs need an allow-list that must be validated against the production domains first. Track in P10. |
| 16 | Rate limiting on login / webhook | ⏳ deferred | Supabase Auth applies its own login rate limits; app-level limits are a P10 item once the hosting platform is fixed. |
| 17 | Dependency audit | ⏳ manual | Run `pnpm audit --prod` before each release (P10 checklist). |
| 18 | DBD chunk text stored at Pinecone (third-party processor, US region on Starter); `PINECONE_API_KEY` server-only; vectors deleted with the document; learners never query another record; transcripts, chunks and cached sweeps (`dbd_pages`, `dbd_chunks`, `dbd_sweeps`) are read-only to the admin and to the manager whose team owns the record, worker-write only | ✅ | `tests/integration/dbd-index.rls.test.ts`, `tests/integration/dbd-index.upload.test.ts`, `pnpm check:secrets` |
| 19 | One manager cannot read or write another team’s learners, records, documents, transcripts, attempts, calls, name cards or audit entries; storage keys are scoped by record and learner id, not merely hidden in the UI | ✅ | `tests/integration/team-isolation.test.ts`, `tests/integration/team-boundaries.test.ts`, `tests/integration/team-helpers.test.ts` |
| 20 | A manager cannot reach Policy settings, the Managers screen or notifications by typing the URL — the request-boundary guard turns them away and each page re-checks against the profile row — and a manager suspended mid-session loses the admin area on their next request. The audit log opens to staff but is narrowed to the caller’s team by RLS through the `security_invoker` view | ✅ | `tests/e2e/manager-access.spec.ts` |
| 21 | The service-role paths a manager can reach — the vector store, signed upload URLs, signed recording URLs — are each gated by a read under the caller’s client, so another team’s record id yields nothing and never reaches the service role | ✅ | `tests/integration/team-gates.test.ts` |

## Notes

- The Vapi *public* key is intentionally sent to the browser per call; it is scoped to starting web calls and is not a secret. The webhook secret and any private key stay server-side.
- Recordings and transcripts contain learner voice and company facts: they live in the private `recordings` bucket and `call_sessions` (admin-only read, learner reads own). Retention automation is post-MVP (`retention_days` reserved, spec §16).
