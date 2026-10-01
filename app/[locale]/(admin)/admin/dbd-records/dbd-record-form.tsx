'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatDate, isISODate, type Locale } from '@/lib/domain/thai-date';
import { useActionState } from 'react';
import type { DbdRecordRow } from '@/lib/db/dbd-records';
import {
  EMPTY_BUSINESS_PROFILE,
  listToText,
  objectivesToText,
  promotersToText,
  shareholdersToText,
  type BusinessProfile,
  type Provenance,
} from '@/lib/domain/dbd-profile';
import { directorsToText, type Director } from '@/lib/domain/dbd-record';
import type { ExtractionSuggestions } from '@/lib/domain/extraction-merge';
import {
  CONTACT_FIELDS,
  missingBusinessAnswers,
  type InterviewProfile,
} from '@/lib/domain/bank-interview';
import { saveDbdRecordAction, type SaveState } from './actions';

/** Level 1 — company identity (หนังสือรับรอง). */
const IDENTITY_FIELDS = [
  ['company_name_th', 'companyNameTh'],
  ['company_name_en', 'companyNameEn'],
  ['juristic_id', 'juristicId'],
  ['registered_on', 'registeredOn'],
  ['registered_capital', 'registeredCapital'],
  ['signing_authority', 'signingAuthority'],
  ['head_office_address', 'headOfficeAddress'],
  ['province', 'province'],
] as const;

/** Level 3 — document metadata. */
const DOCUMENT_FIELDS = [
  ['certificate_no', 'certificateNo'],
  ['document_ref', 'documentRef'],
  ['issued_on', 'issuedOn'],
  ['registrar_name', 'registrarName'],
  ['issuing_office', 'issuingOffice'],
  ['objectives_count', 'objectivesCount'],
] as const;

/**
 * What the certificate cannot say: how to reach the company and what it sells (D58). They sit
 * with the identity fields because that is where a manager looks after an upload, and they stay
 * editable after confirmation — unlike the certificate facts, they are not read off a document.
 */
const BUSINESS_ANSWER_FIELDS = ['nature_of_business', 'products_services'] as const;

const DATE_FIELDS = new Set(['registered_on', 'issued_on']);
/** Long values take the whole row; everything else sits two to a row. */
const WIDE_FIELDS = new Set(['signing_authority', 'head_office_address']);
const initial: SaveState = { ok: false, error: null, fieldErrors: {} };

export function DbdRecordForm({
  record,
  suggestions = null,
  business = null,
  interview = null,
  provenance = {},
  documentNames = [],
}: {
  record: DbdRecordRow | null;
  /** Extraction results; used as defaults only where the record has no value yet. */
  suggestions?: ExtractionSuggestions | null;
  /** Level 2 as stored on the record. */
  business?: BusinessProfile | null;
  /** The four answers the manager owes, stored with the interview profile (D58). */
  interview?: InterviewProfile | null;
  /** Level 3: where each stored value was read (field → page/document/confidence). */
  provenance?: Provenance;
  /** Uploaded document names, in order, to label `source_document`. */
  documentNames?: string[];
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [state, formAction, pending] = useActionState(saveDbdRecordAction, initial);
  const locked = record?.extraction_status === 'confirmed';
  const answers = interview;
  const missingAnswers = missingBusinessAnswers(answers);
  const profile = business ?? EMPTY_BUSINESS_PROFILE;
  const inputClass = 'staff-input mt-1';
  const labelText = 'font-semibold text-ink-900';
  const section = 'grid gap-4 p-4 md:grid-cols-2 md:px-6 md:py-5';
  const wide = 'md:col-span-2';

  /**
   * Record value wins; otherwise the extraction suggestion (if any). A stored value that equals
   * the extraction's reading is shown with its confidence too — that is how auto-filled fields
   * (decision D37) keep their provenance visible until the record is confirmed.
   */
  const defaultFor = (
    name: string,
    recordValue: unknown,
  ): { value: string; suggested: boolean } => {
    const suggestion = suggestions?.values[name];
    if (recordValue !== null && recordValue !== undefined && recordValue !== '') {
      const value = String(recordValue);
      return { value, suggested: !!suggestion && suggestion === value };
    }
    return suggestion ? { value: suggestion, suggested: true } : { value: '', suggested: false };
  };

  const sourceLabel = (name: string) => {
    const p = provenance[name];
    if (!p) return '';
    const doc =
      p.source_document !== null
        ? (documentNames[p.source_document - 1] ?? `#${p.source_document}`)
        : null;
    const parts = [
      doc ? t('sourceDocument', { name: doc }) : null,
      p.source_page !== null ? t('sourcePage', { page: p.source_page }) : null,
    ].filter(Boolean);
    return parts.length ? ` · ${parts.join(', ')}` : '';
  };

  const suggestionNote = (name: string, suggested: boolean) => {
    if (!suggested || !suggestions) return null;
    const low = suggestions.lowConfidence.includes(name);
    const pct = Math.round((suggestions.confidence[name] ?? 0) * 100);
    return (
      <span
        data-testid={`suggestion-${name}`}
        className={`block text-xs ${low ? 'text-warn-700' : 'text-ink-500'}`}
      >
        {t('suggestedFromDocument', { confidence: pct })}
        {sourceLabel(name)}
        {low ? ` — ${t('lowConfidenceHint')}` : ''}
      </span>
    );
  };

  /** Level 2 lists carry one provenance entry per list. */
  const levelTwoNote = (name: string) => {
    const p = provenance[name];
    if (!p || locked) return null;
    const low = p.confidence < 0.8;
    return (
      <span
        data-testid={`provenance-${name}`}
        className={`block text-xs ${low ? 'text-warn-700' : 'text-ink-500'}`}
      >
        {t('suggestedFromDocument', { confidence: Math.round(p.confidence * 100) })}
        {sourceLabel(name)}
        {low ? ` — ${t('lowConfidenceHint')}` : ''}
      </span>
    );
  };

  const renderField = ([name, label]: readonly [string, string]) => {
    const { value, suggested } = defaultFor(name, record?.[name as keyof DbdRecordRow]);
    const low = suggested && suggestions?.lowConfidence.includes(name);
    // Dates are shown the way the certificate prints them (Thai users read พ.ศ.); the stored
    // calendar value only serves the bank-date arithmetic and is never displayed.
    const shown =
      DATE_FIELDS.has(name) && isISODate(value) ? formatDate(value, locale as Locale) : value;
    return (
      <label key={name} className={`text-sm ${WIDE_FIELDS.has(name) ? wide : ''}`}>
        <span className={labelText}>{t(`fields.${label}` as 'fields.companyNameTh')}</span>
        <input
          name={name}
          defaultValue={shown}
          readOnly={locked}
          className={`${inputClass} ${low ? 'border-warn-600 bg-warn-50' : ''}`}
        />
        {DATE_FIELDS.has(name) && <span className="text-xs text-ink-500">{t('dateHint')}</span>}
        {suggestionNote(name, suggested)}
        {state.fieldErrors[name] && (
          <span role="alert" className="block text-xs text-bad-600">
            {state.fieldErrors[name]}
          </span>
        )}
      </label>
    );
  };

  const directorsDefault = defaultFor(
    'directors_text',
    record?.directors && (record.directors as unknown as Director[]).length > 0
      ? directorsToText(record.directors as unknown as Director[])
      : '',
  );

  return (
    <form action={formAction} className="staff-card grid divide-y divide-ink-100 p-0 md:p-0">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={record?.id ?? ''} />

      <section className={section}>
        <h3 className={`text-base font-semibold text-ink-900 ${wide}`}>{t('levels.identity')}</h3>
        {IDENTITY_FIELDS.map(renderField)}
        <label className={`text-sm ${wide}`}>
          <span className={labelText}>{t('fields.directors')}</span>
          <textarea
            name="directors_text"
            rows={3}
            readOnly={locked}
            defaultValue={directorsDefault.value}
            className={inputClass}
          />
          <span className="text-xs text-ink-500">{t('directorsHint')}</span>
          {suggestionNote('directors_text', directorsDefault.suggested)}
        </label>
      </section>

      <section className={section}>
        <div className={wide}>
          <h3 className="text-base font-semibold text-ink-900">{t('levels.answers')}</h3>
          <p className="text-sm text-ink-500">{t('levels.answersIntro')}</p>
        </div>
        {missingAnswers.length > 0 && (
          <p data-testid="answers-missing" className={`staff-notice-warn ${wide}`}>
            {t('answersMissing', {
              fields: missingAnswers
                .map((f) => t(`interviewFields.${f}` as 'interviewFields.account_purpose'))
                .join(', '),
            })}
          </p>
        )}
        {CONTACT_FIELDS.map((field) => (
          <label key={field} className="text-sm">
            <span className={labelText}>
              {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
            </span>
            <span className="text-bad-600"> *</span>
            <input
              name={`interview_${field}`}
              type={field === 'contact_email' ? 'email' : 'text'}
              defaultValue={answers?.[field] ?? ''}
              className={inputClass}
            />
          </label>
        ))}
        {BUSINESS_ANSWER_FIELDS.map((field) => (
          <label key={field} className={`text-sm ${wide}`}>
            <span className={labelText}>
              {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
            </span>
            <span className="text-bad-600"> *</span>
            <textarea
              name={`interview_${field}`}
              rows={3}
              defaultValue={answers?.[field] ?? ''}
              className={inputClass}
            />
          </label>
        ))}
      </section>

      {record && (
        <section className={section} data-testid="business-profile">
          <h3 className={`text-base font-semibold text-ink-900 ${wide}`}>{t('levels.business')}</h3>
          <label className={`text-sm ${wide}`}>
            <span className={labelText}>{t('fields.objectives')}</span>
            <textarea
              name="objectives_text"
              rows={5}
              readOnly={locked}
              defaultValue={objectivesToText(profile.objectives)}
              className={inputClass}
            />
            <span className="text-xs text-ink-500">{t('objectivesHint')}</span>
            {levelTwoNote('objectives')}
          </label>
          <label className={`text-sm ${wide}`}>
            <span className={labelText}>{t('fields.businessCategories')}</span>
            <textarea
              name="business_categories_text"
              rows={2}
              readOnly={locked}
              defaultValue={listToText(profile.business_categories)}
              className={inputClass}
            />
            <span className="text-xs text-ink-500">{t('onePerLine')}</span>
            {levelTwoNote('business_categories')}
          </label>
          <div className={`grid gap-4 sm:grid-cols-2 ${wide}`}>
            <label className="text-sm">
              <span className={labelText}>{t('fields.totalShares')}</span>
              <input
                name="total_shares"
                readOnly={locked}
                defaultValue={profile.share_structure.total_shares ?? ''}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className={labelText}>{t('fields.parValue')}</span>
              <input
                name="par_value"
                readOnly={locked}
                defaultValue={profile.share_structure.par_value ?? ''}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className={labelText}>{t('fields.paidUpCapital')}</span>
              <input
                name="paid_up_capital"
                readOnly={locked}
                defaultValue={profile.share_structure.paid_up_capital ?? ''}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className={labelText}>{t('fields.shareType')}</span>
              <input
                name="share_type"
                readOnly={locked}
                defaultValue={profile.share_structure.share_type ?? ''}
                className={inputClass}
              />
            </label>
          </div>
          <div className={wide}>{levelTwoNote('share_structure')}</div>
          <label className="text-sm">
            <span className={labelText}>{t('fields.shareholders')}</span>
            <textarea
              name="shareholders_text"
              rows={4}
              readOnly={locked}
              defaultValue={shareholdersToText(profile.shareholders)}
              className={inputClass}
            />
            <span className="text-xs text-ink-500">{t('shareholdersHint')}</span>
            {levelTwoNote('shareholders')}
          </label>
          <label className="text-sm">
            <span className={labelText}>{t('fields.promoters')}</span>
            <textarea
              name="promoters_text"
              rows={3}
              readOnly={locked}
              defaultValue={promotersToText(profile.promoters)}
              className={inputClass}
            />
            <span className="text-xs text-ink-500">{t('promotersHint')}</span>
            {levelTwoNote('promoters')}
          </label>
          {['objectives', 'business_categories', 'share_structure', 'shareholders', 'promoters']
            .filter((k) => state.fieldErrors[k])
            .map((k) => (
              <span key={k} role="alert" className={`block text-xs text-bad-600 ${wide}`}>
                {k}: {state.fieldErrors[k]}
              </span>
            ))}
        </section>
      )}

      <section className={section}>
        <h3 className={`text-base font-semibold text-ink-900 ${wide}`}>{t('levels.document')}</h3>
        {DOCUMENT_FIELDS.map(renderField)}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3 p-4 md:px-6">
        {state.error && state.error !== 'validation' && (
          <p role="alert" className="mr-auto text-sm text-bad-600">
            {state.error === 'answers-required' ? t('errors.answers-required') : state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="mr-auto text-sm text-ok-600">
            {t('saved')}
          </p>
        )}
        {/* Always present: the four answers above stay editable after confirmation, and a
          record confirmed before they were required still owes them. The certificate inputs are
          read-only once confirmed, so saving then rewrites them unchanged. */}
        <button type="submit" disabled={pending} className="staff-btn">
          {t('save')}
        </button>
      </div>
    </form>
  );
}
