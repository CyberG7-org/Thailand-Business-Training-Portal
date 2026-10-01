import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { getVariant } from '@/lib/db/mcq-bank';
import { contextForRecord, listVersionedCompanies } from '@/lib/db/mcq-context';
import { createSupabaseServerClient } from '@/lib/db/server';
import { conceptTitle, MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { preflightVariant } from '@/lib/domain/mcq/preflight';
import { renderVariant } from '@/lib/domain/mcq/render';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import { VARIANT_LOCALES } from '@/lib/domain/mcq/variant';
import { VariantStatusForm } from '../../bank-forms';
import { VariantForm } from '../../variant-form';

const LANGUAGE_LABELS = { th: 'ไทย', en: 'English', zh: '中文' } as const;

export default async function VariantPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ company?: string; draw?: string }>;
}) {
  const { locale, id } = await params;
  const query = await searchParams;
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const variant = await getVariant(db, id);
  if (!variant) notFound();
  const def = MCQ_CONCEPTS.find((c) => c.key === variant.conceptKey);
  if (!def) notFound();

  // The preview: the fictional sample company, or a real one that has a training version.
  const companies = await listVersionedCompanies(db);
  const company = companies.find((c) => c.recordId === query.company) ?? null;
  const draw = Math.max(0, Number.parseInt(query.draw ?? '0', 10) || 0);
  const ctx = company ? await contextForRecord(db, company.recordId, null) : SAMPLE_CONTEXT;
  const seed = `preview:${variant.id}:${draw}`;
  const check = ctx ? preflightVariant(variant, ctx, seed) : null;
  const views = ctx
    ? VARIANT_LOCALES.map((language) => ({
        language,
        result: renderVariant(variant, ctx, seed, language),
      }))
    : [];
  const t = await getTranslations('admin.bank');
  const reason = (code: string, detail: string) =>
    t(`failures.${code}` as 'failures.missing_fact', { detail });
  const chosen = company?.recordId ?? 'sample';

  return (
    <section className="grid gap-5">
      <Link href={`/admin/questions/concepts/${def.key}`} className="staff-link text-sm">
        ← {def.mcqOrder}. {conceptTitle(def.key, locale)}
      </Link>
      <h1 className="staff-title">{variant.key}</h1>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <VariantForm conceptKey={def.key} statusFacts={def.alternateWhen} variant={variant} />

        <div className="grid content-start gap-4">
          <VariantStatusForm id={variant.id} status={variant.status} />

          <div className="staff-card grid gap-3">
            <h2 className="text-lg font-semibold">{t('preview.title')}</h2>
            <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
              <label>
                {t('preview.company')}
                <select
                  name="company"
                  defaultValue={chosen}
                  data-testid="preview-company"
                  className="staff-input mt-1"
                >
                  <option value="sample">{t('preview.sample')}</option>
                  {companies.map((c) => (
                    <option key={c.recordId} value={c.recordId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="staff-btn-ghost staff-btn-sm">
                {t('preview.show')}
              </button>
              <Link
                href={`/admin/questions/variants/${variant.id}?company=${chosen}&draw=${draw + 1}`}
                data-testid="preview-redraw"
                className="staff-link"
              >
                {t('preview.redraw')}
              </Link>
            </form>

            {check === null ? (
              <p className="staff-notice-warn text-sm">{t('preview.noVersion')}</p>
            ) : (
              <p
                className={check.ok ? 'staff-notice-ok text-sm' : 'staff-notice-warn text-sm'}
                data-testid="preflight"
                data-ok={check.ok}
              >
                {check.ok
                  ? t('preview.ok')
                  : t('preview.fail', { reason: reason(check.code, check.detail) })}
              </p>
            )}

            {views.map(({ language, result }) => (
              <div
                key={language}
                className="grid gap-1 border-t pt-3 text-sm"
                data-testid={`preview-${language}`}
              >
                <p className="text-xs font-semibold text-ink-700">{LANGUAGE_LABELS[language]}</p>
                {result.ok ? (
                  <>
                    <p className="font-semibold">{result.rendered.prompt}</p>
                    <ol className="grid gap-1">
                      {result.rendered.options.map((option) => (
                        <li
                          key={option.key}
                          data-correct={option.key === variant.correctKey}
                          className={
                            option.key === variant.correctKey ? 'font-semibold text-ok-600' : ''
                          }
                        >
                          {option.key}. {option.text}
                        </li>
                      ))}
                    </ol>
                    {result.rendered.explanation && (
                      <p className="text-ink-700">{result.rendered.explanation}</p>
                    )}
                  </>
                ) : (
                  <p className="text-warn-700">{reason(result.code, result.detail)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
