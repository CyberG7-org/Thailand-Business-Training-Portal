'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { conceptTitle } from '@/lib/domain/concepts/registry';
import type { ExceptionRow } from '@/lib/db/validation';
import { resolveExceptionAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };
const GROUPS = ['acceptance', 'version', 'none'] as const;

type Detail = Record<string, unknown> & {
  rule?: string;
  concepts?: string[];
  confidence?: number;
  issues?: string[];
};

/** What the validators found (spec §5.5), by what it holds back; a person settles what they can. */
export function ExceptionsPanel({
  recordId,
  exceptions,
}: {
  recordId: string;
  exceptions: ExceptionRow[];
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd.exceptions');
  const tf = useTranslations('admin.dbd.facts');
  const ti = useTranslations('admin.dbd.interviewFields');
  const tg = useTranslations('admin.dbd.address.issues');
  const [state, action, pending] = useActionState(resolveExceptionAction, initial);

  const fieldLabel = (field: string, kind: string) => {
    // A quiz that could not start names the concept it could not ask (D100).
    if (kind === 'render_failure') return conceptTitle(field, locale);
    const base = field.split('.')[0]!;
    if (tf.has(base as 'address')) return tf(base as 'address');
    if (ti.has(base as 'account_purpose')) return ti(base as 'account_purpose');
    return field;
  };
  const describe = (e: ExceptionRow) => {
    const d = (e.detail ?? {}) as Detail;
    if (e.kind === 'missing') {
      const concepts = (d.concepts ?? []).map((k) => conceptTitle(k, locale));
      return concepts.length ? t('rules.missing', { concepts: concepts.join(', ') }) : '';
    }
    if (e.kind === 'low_confidence')
      return t('rules.confidence', {
        confidence: Math.round(((d.confidence as number) ?? 0) * 100),
        page: String(d.source_page ?? '—'),
      });
    if (e.kind === 'geo_mismatch')
      return t('rules.geo', {
        issues: ((d.issues ?? []) as string[]).map((i) => tg(i as 'no_address')).join(', '),
      });
    if (e.kind === 'category_review')
      return t('rules.category', {
        candidate: String(d.candidate_key ?? '—'),
        confidence: Math.round(((d.confidence as number) ?? 0) * 100),
      });
    const rule = d.rule as string | undefined;
    return rule && t.has(`rules.${rule}` as 'rules.check_digit')
      ? t(`rules.${rule}` as 'rules.check_digit', d as Record<string, string | number>)
      : '';
  };

  const groups = GROUPS.map((g) => ({ g, rows: exceptions.filter((e) => e.blocks === g) })).filter(
    (x) => x.rows.length > 0,
  );
  return (
    <section
      className="staff-card grid max-w-2xl gap-3"
      data-testid="exceptions-panel"
      data-open={exceptions.length}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-sm text-ink-500">{t('intro')}</p>
      {exceptions.length === 0 && (
        <p className="staff-notice-ok" data-testid="exceptions-none">
          {t('none')}
        </p>
      )}
      {groups.map(({ g, rows }) => (
        <div key={g} className="grid gap-2" data-testid={`exceptions-${g}`}>
          <h3 className="text-sm font-semibold text-ink-700">{t(`groups.${g}`)}</h3>
          <ul className="grid gap-2">
            {rows.map((e) => (
              <li
                key={e.id}
                className="grid gap-1 border-t pt-2 text-sm"
                data-testid={`exception-${e.kind}-${e.field}`}
                data-kind={e.kind}
              >
                <p>
                  <span className="staff-tag">{t(`kinds.${e.kind as 'missing'}`)}</span>{' '}
                  <strong>{fieldLabel(e.field, e.kind)}</strong>
                </p>
                <p className="text-ink-700">{describe(e)}</p>
                {/* Nothing to confirm on these two: one is filled in, the other closes itself
                    when a quiz starts (D100). */}
                {e.kind !== 'missing' && e.kind !== 'render_failure' && (
                  <form action={action} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={recordId} />
                    <input type="hidden" name="exceptionId" value={e.id} />
                    <label className="grid min-w-0 flex-1 gap-1 text-sm">
                      {t('note')}
                      <input name="note" className="staff-input" maxLength={1000} />
                    </label>
                    <button
                      type="submit"
                      name="resolution"
                      value="confirmed"
                      disabled={pending}
                      className="staff-btn staff-btn-sm"
                      data-testid="exception-confirm"
                    >
                      {t('confirmValue')}
                    </button>
                    <button
                      type="submit"
                      name="resolution"
                      value="dismissed"
                      disabled={pending}
                      className="staff-btn-ghost staff-btn-sm"
                      data-testid="exception-dismiss"
                    >
                      {t('dismiss')}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {state.error && (
        <p role="alert" className="text-sm text-bad-600" data-testid="exception-error">
          {t.has(`errors.${state.error}` as 'errors.not-found')
            ? t(`errors.${state.error}` as 'errors.not-found')
            : state.error}
        </p>
      )}
    </section>
  );
}
