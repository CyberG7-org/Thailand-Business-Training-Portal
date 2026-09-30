import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  refreshDerivedFacts,
  remapBusinessCategory,
  setBusinessCategory,
  updateStructuredData,
} from '@/lib/db/derived-facts';
import { manualCategory } from '@/lib/domain/business-category';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { FakeCategoryMapper } from '@/lib/integrations/category-map/fake';
import { adminClient, createTestUser, deleteTestUser, type TestUser } from './helpers';

const svc = adminClient();
const deps = { mapper: new FakeCategoryMapper(), minConfidencePercent: 85 };
const ROI_ET = 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด';

async function stored(id: string) {
  const { data, error } = await svc.from('dbd_records').select('*').eq('id', id).single();
  if (error) throw error;
  return readStructuredData(data.structured_data);
}

async function setInterview(id: string, patch: Record<string, string | null>) {
  const current = await stored(id);
  const { error } = await svc
    .from('dbd_records')
    .update({
      structured_data: { ...current, interview: { ...current.interview, ...patch } } as never,
    })
    .eq('id', id);
  if (error) throw error;
}

describe('refreshDerivedFacts (spec §5.2–5.3)', () => {
  let owner: TestUser;
  let recordId: string;

  beforeAll(async () => {
    owner = await createTestUser('admin');
    const { data, error } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท ข้อเท็จจริง จำกัด',
        head_office_address: ROI_ET,
        created_by: owner.id,
        structured_data: { interview: { nature_of_business: 'ขายเสื้อผ้าออนไลน์' } } as never,
      })
      .select('id')
      .single();
    if (error) throw error;
    recordId = data.id;
  });
  afterAll(async () => {
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(owner.id);
  });

  it('derives the address and maps the category, then leaves them alone', async () => {
    expect(await refreshDerivedFacts(svc, recordId, deps)).toBe('updated');
    const s = await stored(recordId);
    expect(s.address).toMatchObject({ status: 'resolved', postcode: '45110' });
    expect(s.category).toMatchObject({ status: 'mapped', key: 'clothing_fashion', source: 'auto' });
    expect(await refreshDerivedFacts(svc, recordId, deps)).toBe('unchanged');
  });

  it('keeps both through a save that spreads the stored data back', async () => {
    await setInterview(recordId, { main_clients: 'ร้านค้าปลีกในร้อยเอ็ด' });
    const s = await stored(recordId);
    expect(s.address?.status).toBe('resolved');
    expect(s.category?.key).toBe('clothing_fashion');
  });

  it('re-derives the address when the printed address changes', async () => {
    await svc
      .from('dbd_records')
      .update({ head_office_address: 'เลขที่ 1 ตำบลหนองใหญ่ อำเภอไม่มีจริง จังหวัดร้อยเอ็ด' })
      .eq('id', recordId);
    await refreshDerivedFacts(svc, recordId, deps);
    expect((await stored(recordId)).address).toMatchObject({
      status: 'partial',
      issues: ['district_not_found'],
    });
    await svc.from('dbd_records').update({ head_office_address: ROI_ET }).eq('id', recordId);
    await refreshDerivedFacts(svc, recordId, deps);
  });

  it('holds a person’s choice until the business words change', async () => {
    await setBusinessCategory(svc, recordId, 'furniture_home');
    await refreshDerivedFacts(svc, recordId, deps);
    expect((await stored(recordId)).category).toMatchObject({
      key: 'furniture_home',
      source: 'manual',
    });
    await setInterview(recordId, { nature_of_business: 'ขายบ้าน' });
    await refreshDerivedFacts(svc, recordId, deps);
    expect((await stored(recordId)).category).toMatchObject({
      status: 'needs_review',
      candidate_key: 'furniture_home',
      key: null,
    });
  });

  it('refuses a category that is not in the dictionary', async () => {
    await expect(setBusinessCategory(svc, recordId, 'no_such_key')).rejects.toThrow(
      'unknown-category',
    );
  });

  it('records why nothing was mapped when no mapper is configured, and maps again on request', async () => {
    await setInterview(recordId, { nature_of_business: 'ขายเสื้อผ้าออนไลน์' });
    await refreshDerivedFacts(svc, recordId, { mapper: null, minConfidencePercent: 85 });
    expect((await stored(recordId)).category).toMatchObject({
      status: 'unmapped',
      error: 'not_configured',
    });
    await remapBusinessCategory(svc, recordId, deps);
    expect((await stored(recordId)).category).toMatchObject({ status: 'mapped' });
  });

  it('never lets a failing mapper cost the address or throw (D73: category is metadata)', async () => {
    const broken = {
      name: 'fake' as const,
      model: null,
      map: async () => {
        throw new Error('mapper down');
      },
    };
    const { data, error } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท ตัวจับคู่ล่ม จำกัด',
        head_office_address: ROI_ET,
        created_by: owner.id,
        structured_data: { interview: { nature_of_business: 'ขายเสื้อผ้าออนไลน์' } } as never,
      })
      .select('id')
      .single();
    if (error) throw error;
    try {
      await expect(
        refreshDerivedFacts(svc, data.id, { mapper: broken, minConfidencePercent: 85 }),
      ).resolves.toBe('updated');
      const s = await stored(data.id);
      expect(s.address).toMatchObject({ status: 'resolved', postcode: '45110' });
      expect(s.category).toMatchObject({ status: 'unmapped', error: 'mapper down' });
    } finally {
      await svc.from('dbd_records').delete().eq('id', data.id);
    }
  });

  it('keeps an edit that lands between the read and the write of a choice (CAS with retry)', async () => {
    let landed = false;
    const result = await updateStructuredData(svc, recordId, async (stored) => {
      // Another save arrives after this attempt read the record and before it writes.
      if (!landed) {
        landed = true;
        await setInterview(recordId, { main_clients: 'ลูกค้าที่มาระหว่างเขียน' });
      }
      return {
        ...stored,
        category: manualCategory('furniture_home', 'h', new Date().toISOString()),
      };
    });
    expect(result).toBe('updated');
    const s = await stored(recordId);
    expect(s.interview?.main_clients).toBe('ลูกค้าที่มาระหว่างเขียน');
    expect(s.category).toMatchObject({ key: 'furniture_home', source: 'manual' });
  });

  it('reports a race it could not settle instead of overwriting', async () => {
    const result = await updateStructuredData(
      svc,
      recordId,
      async (stored) => {
        await setInterview(recordId, { main_clients: `ลูกค้า ${Date.now()}` });
        return { ...stored, category: null };
      },
      2,
    );
    expect(result).toBe('raced');
    // The stale snapshot never landed: the last concurrent edit and the category are both intact.
    expect((await stored(recordId)).category).toMatchObject({ key: 'furniture_home' });
  });
});
