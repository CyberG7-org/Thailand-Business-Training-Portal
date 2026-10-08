import { describe, expect, it } from 'vitest';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { EMPTY_BUSINESS_PROFILE } from '@/lib/domain/dbd-profile';
import {
  assignmentFacts,
  buildRoleSnapshot,
  buildTrainingSnapshot,
  canonicalJson,
  templateRecordFromRecord,
  templateRecordFromSnapshot,
} from '@/lib/domain/facts/snapshot';
import { FIXED_ROLE } from '@/lib/domain/standard-role';

const record = {
  company_name_th: 'บริษัท ซินเนอร์จี แล็บ จำกัด',
  company_name_en: 'SYNERGY LAB CO., LTD.',
  juristic_id: '0455569000808',
  certificate_no: 'C-1',
  registered_on: '2026-04-16',
  issued_on: '2026-08-05',
  registered_capital: 2_000_000,
  head_office_address: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
  province: 'ร้อยเอ็ด',
  objectives_count: 3,
  directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
  signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อ',
  structured_data: null,
};
const structured = {
  business: {
    ...EMPTY_BUSINESS_PROFILE,
    objectives: [{ no: 1, text: 'ค้าเสื้อผ้า' }],
    shareholders: [
      { name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: null, shares: 18_000, percent: null },
      { name: 'นายสมชาย ใจดี', nationality: null, shares: 2_000, percent: null },
    ],
    share_structure: {
      total_shares: 20_000,
      par_value: 100,
      paid_up_capital: null,
      share_type: null,
    },
  },
  interview: {
    ...EMPTY_INTERVIEW_PROFILE,
    contact_email: 'info@synergy.co.th',
    nature_of_business: 'ค้าส่งเสื้อผ้า',
    monthly_volume: '300,000',
    has_existing_customers: 'yes' as const,
  },
  category: {
    key: 'clothing_fashion',
    candidate_key: null,
    confidence: 0.95,
    source: 'auto' as const,
    status: 'mapped' as const,
    model: null,
    input_hash: 'h',
    error: null,
    decided_at: null,
  },
  provenance: {},
};
const role = {
  holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
  position: 'กรรมการ',
  responsibilities: 'ดูแลลูกค้า',
  relationship_to_shareholders: 'พี่น้อง',
};

describe('the training snapshot (spec §5.6, §7.2)', () => {
  it('freezes the company fact sheet and the extras the old templates read', () => {
    const s = buildTrainingSnapshot({ record, structured, address: null });
    expect(s.facts).toMatchObject({
      company_name_th: record.company_name_th,
      director_count: 1,
      shareholder_count: 2,
      business_category: 'clothing_fashion',
      has_existing_customers: true,
      holder_name: null,
      learner_is_shareholder: null,
    });
    expect(s.extras).toMatchObject({
      certificate_no: 'C-1',
      issued_on: '2026-08-05',
      province: 'ร้อยเอ็ด',
      head_office_address: record.head_office_address,
      contact_email: 'info@synergy.co.th',
      monthly_volume: '300,000',
      par_value: 100,
    });
  });

  it('derives the learner’s shareholding against the frozen sheet', () => {
    const s = buildTrainingSnapshot({ record, structured, address: null });
    expect(buildRoleSnapshot(role, s)).toEqual({
      holder_name: role.holder_name,
      // The same for every learner, whatever was typed before (D95).
      ...FIXED_ROLE,
      learner_is_shareholder: true,
      my_shares: 18_000,
      my_share_percent: 90,
    });
    expect(buildRoleSnapshot({ ...role, holder_name: 'นายภายนอก' }, s)).toMatchObject({
      learner_is_shareholder: false,
      my_shares: null,
    });
    // Nobody picked a name: the company's only director is the learner (D95).
    expect(buildRoleSnapshot({ ...role, holder_name: null }, s)).toMatchObject({
      holder_name: role.holder_name,
      my_shares: 18_000,
    });
    expect(assignmentFacts(s, buildRoleSnapshot(role, s))).toMatchObject({
      holder_name: role.holder_name,
      position: 'กรรมการ',
      learner_is_shareholder: true,
      my_share_percent: 90,
    });
  });

  it('represents a non-shareholder as zero shares in assessment facts', () => {
    const snapshot = buildTrainingSnapshot({ record, structured, address: null });
    const outsider = buildRoleSnapshot({ ...role, holder_name: 'บุคคลภายนอก' }, snapshot);
    expect(outsider).toMatchObject({
      learner_is_shareholder: false,
      my_shares: null,
      my_share_percent: null,
    });
    expect(assignmentFacts(snapshot, outsider)).toMatchObject({
      learner_is_shareholder: false,
      my_shares: 0,
      my_share_percent: 0,
    });
    expect(templateRecordFromSnapshot(snapshot, outsider)).toMatchObject({
      my_shares: 0,
      my_share_percent: 0,
    });
    expect(
      templateRecordFromRecord(
        { ...record, structured_data: structured },
        { ...role, holder_name: 'บุคคลภายนอก' },
      ),
    ).toMatchObject({ my_shares: 0, my_share_percent: 0 });
  });

  it('removes a website claim when projecting an older snapshot with no website', () => {
    const snapshot = buildTrainingSnapshot({ record, structured, address: null });
    const oldSnapshot = {
      ...snapshot,
      facts: {
        ...snapshot.facts,
        client_origin: 'Facebook, TikTok และเว็บไซต์',
      },
      extras: { ...snapshot.extras, website: null },
    };
    expect(assignmentFacts(oldSnapshot, null).client_origin).not.toContain('เว็บไซต์');
  });

  it('renders the same template record from the snapshot as from the live record', () => {
    const s = buildTrainingSnapshot({ record, structured, address: null });
    expect(templateRecordFromSnapshot(s, buildRoleSnapshot(role, s))).toEqual(
      templateRecordFromRecord({ ...record, structured_data: structured }, role),
    );
    expect(templateRecordFromSnapshot(s, null)).toEqual(
      templateRecordFromRecord({ ...record, structured_data: structured }, null),
    );
  });

  it('hashes independently of key order', () => {
    expect(canonicalJson({ b: [1, { z: 1, a: 2 }], a: null })).toBe(
      canonicalJson({ a: null, b: [1, { a: 2, z: 1 }] }),
    );
    expect(canonicalJson({ a: undefined })).toBe('{"a":null}');
  });
});
