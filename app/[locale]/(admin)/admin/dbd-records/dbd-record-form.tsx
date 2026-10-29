'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatDisplayDate } from '@/i18n/format-date';
import type { AppLocale } from '@/i18n/routing';
import { isISODate } from '@/lib/domain/thai-date';
import { useActionState, useEffect, useRef } from 'react';
import type { DbdRecordRow } from '@/lib/db/dbd-records';
import {
  EMPTY_BUSINESS_PROFILE,
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

/** Stored document metadata is preserved, but not repeated in the learner-facts editor. */
const DOCUMENT_FIELDS = [
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
  imageSource = false,
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
  imageSource?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [state, formAction, pending] = useActionState(saveDbdRecordAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const saveChanged = () => {
    if (!record?.id || !dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (formRef.current && dirty.current) {
        dirty.current = false;
        formRef.current.requestSubmit();
      }
    }, 900);
  };
  const locked = record?.extraction_status === 'confirmed' && !imageSource;
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
      DATE_FIELDS.has(name) && isISODate(value)
        ? formatDisplayDate(value, locale as AppLocale)
        : value;
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
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        dirty.current = false;
        if (timer.current) clearTimeout(timer.current);
      }}
      onInput={() => {
        dirty.current = true;
        saveChanged();
      }}
      onChange={() => {
        dirty.current = true;
        saveChanged();
      }}
      onBlurCapture={() => {
        if (dirty.current) saveChanged();
      }}
      className="staff-card grid divide-y divide-ink-100 p-0 md:p-0"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={record?.id ?? ''} />
      <input
        type="hidden"
        name="certificate_no"
        value={record?.certificate_no ?? suggestions?.values.certificate_no ?? ''}
      />
      {DOCUMENT_FIELDS.map(([name]) => (
        <input
          key={name}
          type="hidden"
          name={name}
          value={record?.[name] ?? suggestions?.values[name] ?? ''}
        />
      ))}

      <section className={section}>
        <h3 className={`text-base font-semibold text-ink-900 ${wide}`}>{t('levels.identity')}</h3>
        {IDENTITY_FIELDS.slice(0, 2).map(renderField)}
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
        {IDENTITY_FIELDS.slice(2).map(renderField)}
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
          <p className={`text-sm text-ink-500 ${wide}`}>
            {t('fields.paidUpCapital')} = {t('fields.registeredCapital')}
          </p>
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
            <span className="text-xs text-ink-500">
              One shareholder per line: name, percentage or name | nationality | shares | percentage
            </span>
            {levelTwoNote('shareholders')}
          </label>
          {['share_structure', 'shareholders']
            .filter((k) => state.fieldErrors[k])
            .map((k) => (
              <span key={k} role="alert" className={`block text-xs text-bad-600 ${wide}`}>
                {k}: {state.fieldErrors[k]}
              </span>
            ))}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 p-4 md:px-6">
        {state.error && state.error !== 'validation' && (
          <p role="alert" className="mr-auto text-sm text-bad-600">
            {state.error === 'answers-required' ? t('errors.answers-required') : state.error}
          </p>
        )}
        {/* Always present: the four answers above stay editable after confirmation, and a
          record confirmed before they were required still owes them. The certificate inputs are
          read-only once confirmed, so saving then rewrites them unchanged. */}
        <span className="text-xs text-ink-500" aria-live="polite">
          {pending ? t('saving') : state.ok ? t('saved') : t('autoSave')}
        </span>
        <button type="submit" disabled={pending} className="staff-btn">
          {t('save')}
        </button>
      </div>
    </form>
  );
}
