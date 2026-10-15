# Deterministic business categories (primary-25-v1)

## Audit and design

The old `rules-v1` classifier checked the same phrase list against business description and products, then returned `null` when the highest scores tied. The chosen key lived in `dbd_records.structured_data.category` (JSON, no category FK). Forty legacy category keys and their illustrative financial figures lived in `lib/domain/business-natures.ts`; a separate Owner-editable `business_categories` table supplies quiz distractors. Existing manual overrides are also stored in the JSON assignment. Image/PDF/ZIP extraction is upstream and unchanged.

The new `rules-v2` classifier uses the versioned 25-key registry in `lib/domain/category-taxonomy.ts`. It scores normalized Thai/English phrases by source field, caps repetitions per concept/field, applies service/product and mixed-furniture precedences, and resolves positive ties by stable key order. No distinctive evidence maps to `general_other` with `method=fallback`, not a claimed high-confidence match. The stored trace includes matched phrases/fields, score, method, versions, explanation, and fallback reason. The confidence field is `null` for local rules; its score is **not** a probability.

## Compatibility and rollback

- No SQL migration or deletion is required: category assignments are JSON and legacy 40-key rows and planning figures remain intact.
- The explicit 40-to-25 crosswalk documents semantics; it is **not** blindly applied to records. Old automatic assignments are reclassified from their stored text. Manual assignments are never silently changed.
- A record reclassified from a legacy key retains `legacy_figures_key`, so its existing illustrative numbers do not change merely because multiple old labels merged. New records use the matching legacy reference figure until the product owner approves revised figures. `general_other` has no invented figures.
- `backfillPrimaryCategories(db)` is a dry run by default. It reports counts without writing and skips unread/failed-ingestion records and manual overrides. `backfillPrimaryCategories(db, { apply: true })` applies compare-and-set updates, stores the prior assignment in `category_backfill_previous`, and can be rerun safely. `restoreBackfilledCategory(db, recordId)` restores one prior automatic assignment unless a subsequent manual choice has been made. Neither backfill method calls document extraction, a model, or an external classifier.
- Apply a backfill only from a trusted, authenticated server-side maintenance context after verifying the target Supabase project and inspecting the dry-run counts. Do not run it by default during deployment. Staging should be tested before production. A rollback of deployed code does not itself revert data; use the saved previous assignment per record if rollback is required.

## Deployment checks

1. Deploy to Staging; upload a mixed furniture/kitchen poster, a clear single-category poster, and an ambiguous/generic poster. Confirm the selected key, method, evidence, and fallback wording in the Bank interview tab.
2. Verify old records and active training versions still render their category, quiz and illustrative figures. Confirm manual choices remain unchanged.
3. Review dry-run backfill counts. Apply in controlled batches only after a database snapshot and authorization for the target environment. Recheck category distribution, fallback rate, and any high-frequency collision pairs before Main deployment.

The 24 labeled unit examples are seed fixtures, not a measured real-world accuracy estimate. Historical-record accuracy needs a separately labeled sample; 100% non-null assignment is not evidence of accuracy.
