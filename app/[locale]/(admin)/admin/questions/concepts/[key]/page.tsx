import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { listVariants } from '@/lib/db/mcq-bank';
import { createSupabaseServerClient } from '@/lib/db/server';
import { conceptTitle, MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { TOKENS, type TokenName } from '@/lib/domain/mcq/tokens';

const EXAMPLES = [
  '{registered_capital|numeric(x0.5)}',
  '{registered_capital|numeric(+1000)}',
  '{director_count|count(+1)}',
  '{registered_on|date(-1y)}',
  '{juristic_id|id_mutation}',
  '{province|geo_alt(region)}',
  '{district|geo_alt(province)}',
  '{subdistrict|geo_alt(district)}',
  '{business_category|business_alt}',
];
const ALL_TOKENS = Object.keys(TOKENS) as TokenName[];

/** One concept: what its correct answer may be built from, and the variants written for it. */
export default async function ConceptPage({
  params,
}: {
  params: Promise<{ locale: string; key: string }>;
}) {
  const { locale, key } = await params;
  await requireAdmin(locale);
  const def = MCQ_CONCEPTS.find((c) => c.key === key);
  if (!def) notFound();
  const variants = (await listVariants(await createSupabaseServerClient())).filter(
    (v) => v.conceptKey === key,
  );
  const facts: readonly string[] = def.facts;
  const own = ALL_TOKENS.filter((name) => TOKENS[name].facts.every((f) => facts.includes(f)));
  const t = await getTranslations('admin.bank');
  return (
    <section className="grid gap-5">
      <Link href="/admin/questions" className="staff-link text-sm">
        ← {t('concept.back')}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="staff-title">
          {def.mcqOrder}. {conceptTitle(def.key, locale)}
        </h1>
        {def.critical && <span className="staff-tag">{t('critical')}</span>}
        <span className="staff-tag">{t(`sources.${def.source}` as 'sources.DBD_FACT')}</span>
      </div>

      <div className="staff-card grid gap-3 text-sm">
        <div>
          <p className="font-semibold">{t('concept.facts')}</p>
          {own.length === 0 ? (
            <p className="text-ink-700">{t('concept.noFacts')}</p>
          ) : (
            <p data-testid="concept-tokens" className="flex flex-wrap gap-2">
              {own.map((name) => (
                <code key={name}>{`{${name}}`}</code>
              ))}
            </p>
          )}
        </div>
        <details>
          <summary className="cursor-pointer font-semibold">{t('concept.grammarTitle')}</summary>
          <p className="mt-2 text-ink-700">{t('concept.grammar')}</p>
          <p className="mt-1 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <code key={example}>{example}</code>
            ))}
          </p>
          <p className="mt-3 font-semibold">{t('concept.allTokens')}</p>
          <p className="mt-1 flex flex-wrap gap-2">
            {ALL_TOKENS.map((name) => (
              <code key={name}>{`{${name}}`}</code>
            ))}
          </p>
        </details>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('concept.variants')}</h2>
        <Link
          href={`/admin/questions/variants/new?concept=${def.key}`}
          data-testid="variant-new"
          className="staff-btn staff-btn-sm"
        >
          {t('concept.newVariant')}
        </Link>
      </div>
      {variants.length === 0 ? (
        <p className="text-sm text-ink-700">{t('concept.none')}</p>
      ) : (
        <div className="staff-table-wrap">
          <table className="staff-table">
            <thead>
              <tr>
                <th>{t('concept.columns.key')}</th>
                <th>{t('concept.columns.when')}</th>
                <th>{t('concept.columns.prompt')}</th>
                <th>{t('concept.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="align-top" data-testid={`variant-${v.key}`}>
                  <td className="whitespace-nowrap">
                    <Link href={`/admin/questions/variants/${v.id}`} className="staff-link">
                      {v.key}
                    </Link>
                  </td>
                  <td>
                    {v.appliesWhen
                      ? t(v.appliesWhen.value ? 'caseYes' : 'caseNo', {
                          fact: t(
                            `statusFacts.${v.appliesWhen.fact}` as 'statusFacts.operations_started',
                          ),
                        })
                      : t('caseAlways')}
                  </td>
                  <td className="max-w-md text-ink-700">{v.texts.th?.prompt ?? '—'}</td>
                  <td data-testid="variant-row-status" data-status={v.status}>
                    {t(`status.${v.status}` as 'status.draft')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
