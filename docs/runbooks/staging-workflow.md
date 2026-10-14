# Staging workflow

The portal has two long-lived Git branches and separate Supabase projects:

| Environment | Git branch | Website | Database |
| --- | --- | --- | --- |
| Production | `main` | `https://thailand-business-training-portal-cyberg7.vercel.app` | Existing production Supabase project |
| Staging | `staging` | `https://thailand-business-training-portal-staging.vercel.app` | `Thailand-Business-Training-Portal-Staging` (`coykyocibwaxvamsgccq`) |

The staging address is a Vercel project domain assigned only to the `staging` branch. A new push to `staging` replaces its deployment, while `main` and its production website stay unchanged. Vercel's Preview deployment protection may require a Vercel account to open the staging address.

The initial staging Owner has portal Login ID `owner`. Its password was chosen privately during staging setup and is not stored in this repository. This account exists only in the staging Supabase project.

## Make and test a change

1. Start from the current `staging` branch (or create a feature branch from it), make the change, and run the relevant local checks.
2. Push to `staging` (directly or by merging a feature pull request into it). GitHub CI runs the `test` job and both browser-test shards. Vercel deploys the new staging build automatically.
3. Open the stable staging URL. Check `/api/health`, then exercise the changed flow using staging-only accounts and data. Do not use real customer records for tests.
4. For schema changes, run the new migrations against the staging Supabase project **before** testing the staging deployment. Verify the linked project ref before `supabase db push`:

   ```powershell
   Get-Content supabase/.temp/project-ref
   pnpm exec supabase db push --linked --dry-run
   pnpm exec supabase db push --linked --yes --skip-vault
   ```

   The ref must be `coykyocibwaxvamsgccq`. Never run the staging migration command while linked to the production ref.

## Promote to production

1. Confirm the staging website and all required CI checks pass.
2. Open a pull request from `staging` into `main`. The protected `main` branch requires a pull request and passing `test`, `e2e (1)`, and `e2e (2)` checks; direct pushes and force pushes are disabled.
3. For schema changes, plan and apply production migrations in the order required by the release's migration notes. Staging and production databases do not sync their data.
4. Merge the approved pull request. Vercel deploys `main` to the production URL. Smoke-test `/api/health` and the changed flow there.

## Environment separation

Vercel's `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` must be scoped to **Preview branch `staging`** with values from the staging Supabase project. Production has its own values, scoped to Production. Never widen either service-role key to All Environments. The Gemini key currently spans All Environments, so staging calls may consume the same Google AI Studio quota as production. Other optional integrations (Apify, Pinecone, etc.) need staging-scoped keys/configuration before those flows can be tested. For Pinecone, use a separate `staging` namespace.

Staging needs its own first owner account; the database migrations deliberately do not copy production accounts or company data. Follow `production-setup.md` section 1 for one-time Auth setup, and create only test users and companies.
