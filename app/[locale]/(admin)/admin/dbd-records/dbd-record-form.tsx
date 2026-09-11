'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { DbdRecordRow } from '@/lib/db/dbd-records';
import { directorsToText, type Director } from '@/lib/domain/dbd-record';
import { saveDbdRecordAction, type SaveState } from './actions';

const FIELDS = [
  ['company_name_th', 'companyNameTh'],
  ['company_name_en', 'companyNameEn'],
  ['juristic_id', 'juristicId'],
  ['certificate_no', 'certificateNo'],
  ['document_ref', 'documentRef'],
  ['registered_on', 'registeredOn'],
  ['issued_on', 'issuedOn'],
  ['registered_capital', 'registeredCapital'],
  ['head_office_address', 'headOfficeAddress'],
  ['signing_authority', 'signingAuthority'],
  ['objectives_count', 'objectivesCount'],
  ['issuing_office', 'issuingOffice'],
  ['registrar_name', 'registrarName'],
] as const;

const DATE_FIELDS = new Set(['registered_on', 'issued_on']);
const initial: SaveState = { ok: false, error: null, fieldErrors: {} };

export function DbdRecordForm({ record }: { record: DbdRecordRow | null }) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [state, formAction, pending] = useActionState(saveDbdRecordAction, initial);
  const locked = record?.extraction_status === 'confirmed';
  return (
    <form action={formAction} className="grid max-w-2xl gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={record?.id ?? ''} />
      {FIELDS.map(([name, label]) => (
        <label key={name} className="text-sm">
          {t(`fields.${label}`)}
          <input
            name={name}
            defaultValue={record?.[name] == null ? '' : String(record[name])}
            readOnly={locked}
            className="mt-1 w-full rounded border px-2 py-1 read-only:bg-gray-100"
          />
          {DATE_FIELDS.has(name) && <span className="text-xs text-gray-500">{t('dateHint')}</span>}
          {state.fieldErrors[name] && (
            <span role="alert" className="block text-xs text-red-700">
              {state.fieldErrors[name]}
            </span>
          )}
        </label>
      ))}
      <label className="text-sm">
        {t('fields.directors')}
        <textarea
          name="directors_text"
          rows={3}
          readOnly={locked}
          defaultValue={directorsToText((record?.directors as unknown as Director[] | null) ?? [])}
          className="mt-1 w-full rounded border px-2 py-1 read-only:bg-gray-100"
        />
        <span className="text-xs text-gray-500">{t('directorsHint')}</span>
      </label>
      {state.error && state.error !== 'validation' && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm text-green-700">
          {t('saved')}
        </p>
      )}
      {!locked && (
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {t('save')}
        </button>
      )}
    </form>
  );
}
