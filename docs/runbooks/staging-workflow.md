# Staging workflow

The portal has two long-lived Git branches, separate Vercel projects, and separate Supabase projects:

| Environment | Git branch | Vercel project | Website | Database |
| --- | --- | --- | --- | --- |
| Production | `main` | `thailand-business-training-portal` | `https://thailand-business-training-portal.vercel.app` | Existing production Supabase project |
| Staging | `staging` | `thailand-business-training-portal-staging` | `https://thailand-business-training-portal-staging.vercel.app` | `Thailand-Business-Training-Portal-Staging` (`coykyocibwaxvamsgccq`) |

The staging Vercel project's Production Branch is `staging`; the production project's Production Branch is `main`. A new push to `staging` creates a production-class deployment **inside the staging project**, allowing its `vercel.json` cron jobs to run. It does not deploy to the customer-facing production project. The staging address is assigned only to the staging project. Vercel deployment protection may require a Vercel account to open generated deployment URLs.

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

In the staging Vercel project, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` belong to that project's **Production** environment and must refer only to the staging Supabase project. The production Vercel project retains its own production database variables. Never copy a production Supabase service-role key into staging. Other integrations (Gemini, Anthropic, Apify, Pinecone) require credentials in the staging project before those flows can be tested and may consume the corresponding provider accounts' quotas. `PINECONE_NAMESPACE` must be `staging` so vector writes do not mix with production. Use a separate staging `CRON_SECRET` to authorize its scheduled endpoints.

Staging needs its own first owner account; the database migrations deliberately do not copy production accounts or company data. Follow `production-setup.md` section 1 for one-time Auth setup, and create only test users and companies.
