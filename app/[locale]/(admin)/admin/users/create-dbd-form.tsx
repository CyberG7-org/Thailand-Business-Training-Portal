'use client';

import { useLocale, useTranslations } from 'next-intl';
import { PdfFilePicker } from '@/components/staff/pdf-file-picker';
import { Link } from '@/i18n/navigation';
import { REQUIRED_INTERVIEW_FIELDS } from '@/lib/domain/bank-interview';
import { UPLOAD_ERROR_KEYS, useDirectUpload } from '../dbd-records/use-direct-upload';

/** The two details written as sentences; the contact details are one line each. */
const PROSE_FIELDS = new Set<string>(['nature_of_business', 'products_services']);

/**
 * "Create DBD" (D80): the pack and the four details only a manager can give, sent in one go.
 * The record is created with the details already on it, the documents go straight from the
 * browser to storage (D45), and the reader fills and indexes the rest in the background — a
 * clean record then confirms itself. The staff member stays here and watches the list above.
 * `embedded` drops the card and the title, for the foot of the companies list, which has both.
 */
export function CreateDbdForm({
  extractionAvailable,
  embedded = false,
}: {
  extractionAvailable: boolean;
  embedded?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.createDbd');
  const td = useTranslations('admin.dbd');
  const { state, pending, submit } = useDirectUpload({
    locale,
    id: null,
    redirect: false,
    withAnswers: true,
  });
  const uploadError = UPLOAD_ERROR_KEYS.find((k) => k === state.error);
  const badAnswers = state.error?.startsWith('answers:')
    ? state.error.slice('answers:'.length).split(',').filter(Boolean)
    : [];
  const fieldLabel = (field: string) =>
    td(`interviewFields.${field}` as 'interviewFields.contact_email');
  // Embedded, the two contact lines sit side by side and everything else spans the row.
  const wide = embedded ? 'md:col-span-2' : '';
  const label = embedded ? 'font-semibold text-ink-900' : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      id="create-dbd"
      className={`grid scroll-mt-6 ${embedded ? 'max-w-3xl gap-4 md:grid-cols-2' : 'staff-card max-w-2xl gap-3'}`}
      data-testid="create-dbd"
    >
      {!embedded && <h2 className="font-semibold">{t('title')}</h2>}
      <p className={`text-sm text-ink-700 ${wide}`}>
        {extractionAvailable ? t('intro') : t('introNoReader')}
      </p>
      <div className={wide}>
        <PdfFilePicker
          name="document"
          label={t('documents')}
          hint={td('fileHint')}
          testId="create-dbd-files"
          strongLabel={embedded}
        />
      </div>
      {REQUIRED_INTERVIEW_FIELDS.map((field) => {
        const invalid = badAnswers.includes(field);
        const common = {
          name: `interview_${field}`,
          required: true,
          'aria-invalid': invalid || undefined,
          'data-testid': `create-dbd-${field}`,
          className: 'staff-input mt-1',
        };
        return (
          <label key={field} className={`text-sm ${PROSE_FIELDS.has(field) ? wide : ''}`}>
            <span className={label}>{fieldLabel(field)}</span>
            {PROSE_FIELDS.has(field) ? (
              <textarea {...common} rows={3} maxLength={2000} />
            ) : (
              <input
                {...common}
                type={(field as string) === 'contact_email' ? 'email' : 'tel'}
                maxLength={(field as string) === 'contact_email' ? 320 : 200}
                autoComplete="off"
              />
            )}
          </label>
        );
      })}
      {state.error && (
        <p role="alert" data-testid="create-dbd-error" className={`text-sm text-bad-600 ${wide}`}>
          {badAnswers.length > 0
            ? t('answersInvalid', { fields: badAnswers.map(fieldLabel).join(', ') })
            : uploadError
              ? td(`errors.${uploadError}`)
              : state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" data-testid="create-dbd-status" className={`staff-notice-ok ${wide}`}>
          {extractionAvailable ? t('created') : t('createdNoReader')}
        </p>
      )}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${wide}`}>
        <button
          type="submit"
          disabled={pending}
          data-testid="create-dbd-submit"
          className="staff-btn"
        >
          {pending ? td('uploadingAndReading') : t('submit')}
        </button>
        <Link href="/admin/dbd-records/new" className="staff-link text-sm">
          {t('byHand')}
        </Link>
      </div>
    </form>
  );
}
