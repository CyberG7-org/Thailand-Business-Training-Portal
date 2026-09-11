import { describe, expect, it } from 'vitest';
import {
  dbdRecordInputSchema,
  directorsToText,
  missingFieldsForConfirmation,
  parseDirectorsText,
} from '@/lib/domain/dbd-record';

const valid = {
  juristic_id: '0535569000360',
  certificate_no: 'E53001920000346',
  document_ref: '',
  company_name_th: 'บริษัท ศิรภัทร สยาม จำกัด',
  company_name_en: 'SIRAPHAT SIAM CO., LTD.',
  registered_on: '10/04/2569',
  issued_on: '13/07/2569',
  registered_capital: '2,000,000.00',
  head_office_address: '194/3 หมู่ 2 ต.วังใหญ่ อ.เทพา จ.สงขลา',
  signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
  objectives_count: '14',
  issuing_office: '',
  registrar_name: '',
  directors: [{ name_th: 'นางสาวภมรรัตน์ จันทะศิโล', name_en: 'Miss Phamonrat Chantasilo' }],
};

describe('dbdRecordInputSchema', () => {
  it('normalizes Buddhist-Era dates to CE and parses capital with separators', () => {
    const out = dbdRecordInputSchema.parse(valid);
    expect(out.registered_on).toBe('2026-04-10');
    expect(out.issued_on).toBe('2026-07-13');
    expect(out.registered_capital).toBe(2000000);
    expect(out.objectives_count).toBe(14);
    expect(out.document_ref).toBeNull();
  });
  it('rejects a juristic id that is not 13 digits', () => {
    expect(dbdRecordInputSchema.safeParse({ ...valid, juristic_id: '123' }).success).toBe(false);
  });
  it('rejects an issued-on date before the registration date', () => {
    const r = dbdRecordInputSchema.safeParse({ ...valid, issued_on: '01/01/2569' });
    expect(r.success).toBe(false);
  });
  it('rejects an invalid date string', () => {
    expect(dbdRecordInputSchema.safeParse({ ...valid, issued_on: '31/02/2569' }).success).toBe(
      false,
    );
  });
  it('turns empty strings into nulls and allows an empty form', () => {
    const out = dbdRecordInputSchema.parse({});
    expect(out).toMatchObject({
      juristic_id: null,
      company_name_th: null,
      issued_on: null,
      registered_capital: null,
      directors: [],
    });
  });
});

describe('directors text', () => {
  it('parses one director per line as "Thai name | English name"', () => {
    expect(parseDirectorsText('นางสาว ก | Miss A\nนาย ข\n\n')).toEqual([
      { name_th: 'นางสาว ก', name_en: 'Miss A' },
      { name_th: 'นาย ข', name_en: null },
    ]);
  });
  it('round-trips', () => {
    const list = [
      { name_th: 'นางสาว ก', name_en: 'Miss A' },
      { name_th: 'นาย ข', name_en: null },
    ];
    expect(parseDirectorsText(directorsToText(list))).toEqual(list);
  });
});

describe('missingFieldsForConfirmation', () => {
  it('lists the core fields that are still empty', () => {
    expect(missingFieldsForConfirmation({ juristic_id: null, company_name_th: 'x' })).toEqual([
      'juristic_id',
    ]);
    expect(
      missingFieldsForConfirmation({ juristic_id: '0535569000360', company_name_th: 'x' }),
    ).toEqual([]);
  });
});
