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
  const inputClass = 'mt-1 w-full rounded border px-2 py-1 read-only:bg-gray-100';

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
        className={`block text-xs ${low ? 'text-amber-700' : 'text-gray-500'}`}
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
        className={`block text-xs ${low ? 'text-amber-700' : 'text-gray-500'}`}
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
      <label key={name} className="text-sm">
        {t(`fields.${label}` as 'fields.companyNameTh')}
        <input
          name={name}
          defaultValue={shown}
          readOnly={locked}
          className={`${inputClass} ${low ? 'border-amber-500 bg-amber-50' : ''}`}
        />
        {DATE_FIELDS.has(name) && <span className="text-xs text-gray-500">{t('dateHint')}</span>}
        {suggestionNote(name, suggested)}
        {state.fieldErrors[name] && (
          <span role="alert" className="block text-xs text-red-700">
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
    <form action={formAction} className="grid max-w-2xl gap-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={record?.id ?? ''} />

      <fieldset className="grid gap-3 rounded border p-4">
        <legend className="px-1 text-sm font-semibold">{t('levels.identity')}</legend>
        {IDENTITY_FIELDS.map(renderField)}
        <label className="text-sm">
          {t('fields.directors')}
          <textarea
            name="directors_text"
            rows={3}
            readOnly={locked}
            defaultValue={directorsDefault.value}
            className={inputClass}
          />
          <span className="text-xs text-gray-500">{t('directorsHint')}</span>
          {suggestionNote('directors_text', directorsDefault.suggested)}
        </label>

        <div className="grid gap-3 border-t pt-3">
          {missingAnswers.length > 0 && (
            <p data-testid="answers-missing" className="text-sm text-amber-800">
              {t('answersMissing', {
                fields: missingAnswers
                  .map((f) => t(`interviewFields.${f}` as 'interviewFields.account_purpose'))
                  .join(', '),
              })}
            </p>
          )}
          <p className="text-xs font-semibold text-gray-700">{t('interviewGroups.contact')}</p>
          {CONTACT_FIELDS.map((field) => (
            <label key={field} className="text-sm">
              {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
              <span className="text-red-700"> *</span>
              <input
                name={`interview_${field}`}
                type={field === 'contact_email' ? 'email' : 'text'}
                defaultValue={answers?.[field] ?? ''}
                className={inputClass}
              />
            </label>
          ))}
          <p className="text-xs font-semibold text-gray-700">{t('interviewGroups.business')}</p>
          {BUSINESS_ANSWER_FIELDS.map((field) => (
            <label key={field} className="text-sm">
              {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
              <span className="text-red-700"> *</span>
              <textarea
                name={`interview_${field}`}
                rows={3}
                defaultValue={answers?.[field] ?? ''}
                className={inputClass}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {record && (
        <fieldset className="grid gap-3 rounded border p-4" data-testid="business-profile">
          <legend className="px-1 text-sm font-semibold">{t('levels.business')}</legend>
          <label className="text-sm">
            {t('fields.objectives')}
            <textarea
              name="objectives_text"
              rows={5}
              readOnly={locked}
              defaultValue={objectivesToText(profile.objectives)}
              className={inputClass}
            />
            <span className="text-xs text-gray-500">{t('objectivesHint')}</span>
            {levelTwoNote('objectives')}
          </label>
          <label className="text-sm">
            {t('fields.businessCategories')}
            <textarea
              name="business_categories_text"
              rows={2}
              readOnly={locked}
              defaultValue={listToText(profile.business_categories)}
              className={inputClass}
            />
            <span className="text-xs text-gray-500">{t('onePerLine')}</span>
            {levelTwoNote('business_categories')}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t('fields.totalShares')}
              <input
                name="total_shares"
                readOnly={locked}
                defaultValue={profile.share_structure.total_shares ?? ''}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              {t('fields.parValue')}
              <input
                name="par_value"
                readOnly={locked}
                defaultValue={profile.share_structure.par_value ?? ''}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              {t('fields.paidUpCapital')}
              <input
                name="paid_up_capital"
                readOnly={locked}
                defaultValue={profile.share_structure.paid_up_capital ?? ''}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              {t('fields.shareType')}
              <input
                name="share_type"
                readOnly={locked}
                defaultValue={profile.share_structure.share_type ?? ''}
                className={inputClass}
              />
            </label>
          </div>
          {levelTwoNote('share_structure')}
          <label className="text-sm">
            {t('fields.shareholders')}
            <textarea
              name="shareholders_text"
              rows={4}
              readOnly={locked}
              defaultValue={shareholdersToText(profile.shareholders)}
              className={inputClass}
            />
            <span className="text-xs text-gray-500">{t('shareholdersHint')}</span>
            {levelTwoNote('shareholders')}
          </label>
          <label className="text-sm">
            {t('fields.promoters')}
            <textarea
              name="promoters_text"
              rows={3}
              readOnly={locked}
              defaultValue={promotersToText(profile.promoters)}
              className={inputClass}
            />
            <span className="text-xs text-gray-500">{t('promotersHint')}</span>
            {levelTwoNote('promoters')}
          </label>
          {['objectives', 'business_categories', 'share_structure', 'shareholders', 'promoters']
            .filter((k) => state.fieldErrors[k])
            .map((k) => (
              <span key={k} role="alert" className="block text-xs text-red-700">
                {k}: {state.fieldErrors[k]}
              </span>
            ))}
        </fieldset>
      )}

      <fieldset className="grid gap-3 rounded border p-4">
        <legend className="px-1 text-sm font-semibold">{t('levels.document')}</legend>
        {DOCUMENT_FIELDS.map(renderField)}
      </fieldset>

      {state.error && state.error !== 'validation' && (
        <p role="alert" className="text-sm text-red-700">
          {state.error === 'answers-required' ? t('errors.answers-required') : state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm text-green-700">
          {t('saved')}
        </p>
      )}
      {/* Always present: the four answers above stay editable after confirmation, and a
          record confirmed before they were required still owes them. The certificate inputs are
          read-only once confirmed, so saving then rewrites them unchanged. */}
      <button
        type="submit"
        disabled={pending}
        className="justify-self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {t('save')}
      </button>
    </form>
  );
}
