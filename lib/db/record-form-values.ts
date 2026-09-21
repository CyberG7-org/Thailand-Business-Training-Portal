import { directorsToText, type Director } from '@/lib/domain/dbd-record';
import type { RecordFormValues } from '@/lib/domain/extraction-merge';
import type { DbdRecordRow } from './dbd-records';

/** The record's columns as the strings the admin form shows (empty string = no value). */
export function recordToFormValues(record: DbdRecordRow): RecordFormValues {
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    juristic_id: text(record.juristic_id),
    certificate_no: text(record.certificate_no),
    document_ref: text(record.document_ref),
    company_name_th: text(record.company_name_th),
    company_name_en: text(record.company_name_en),
    registered_on: text(record.registered_on),
    issued_on: text(record.issued_on),
    registered_capital: text(record.registered_capital),
    head_office_address: text(record.head_office_address),
    province: text(record.province),
    signing_authority: text(record.signing_authority),
    objectives_count: text(record.objectives_count),
    issuing_office: text(record.issuing_office),
    registrar_name: text(record.registrar_name),
    directors_text: directorsToText((record.directors as unknown as Director[] | null) ?? []),
  };
}
