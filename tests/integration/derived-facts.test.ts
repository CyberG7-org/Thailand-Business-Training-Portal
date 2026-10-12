import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
const deps = { mapper: new FakeCategoryMapper() };
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

  it('derives the address and leaves the category for staff to choose', async () => {
    expect(await refreshDerivedFacts(svc, recordId, deps)).toBe('updated');
    const s = await stored(recordId);
    expect(s.address).toMatchObject({ status: 'resolved', postcode: '45110' });
    expect(s.category).toMatchObject({ status: 'unmapped', error: 'choose-category' });
    expect(await refreshDerivedFacts(svc, recordId, deps)).toBe('unchanged');
  });

  it('keeps both through a save that spreads the stored data back', async () => {
    await setInterview(recordId, { main_clients: 'ร้านค้าปลีกในร้อยเอ็ด' });
    const s = await stored(recordId);
    expect(s.address?.status).toBe('resolved');
    expect(s.category?.key).toBeNull();
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

  it('writes the marks a reader dropped back into the record’s own address (D92)', async () => {
    await svc
      .from('dbd_records')
      .update({ head_office_address: 'เลขที่ 87 หมูที่ 9 ตำบลหนองใหญ อำเภอโพนทอง จังหวัดร้อยเอ็ด' })
      .eq('id', recordId);
    expect(await refreshDerivedFacts(svc, recordId, deps)).toBe('updated');
    const { data } = await svc
      .from('dbd_records')
      .select('head_office_address')
      .eq('id', recordId)
      .single();
    expect(data?.head_office_address).toBe(ROI_ET);
    expect((await stored(recordId)).address).toMatchObject({ status: 'resolved', full: ROI_ET });
    // Nothing left to repair: the next derive changes nothing.
    expect(await refreshDerivedFacts(svc, recordId, deps)).toBe('unchanged');
  });

  it('holds a person’s approved category when business words change', async () => {
    await setBusinessCategory(svc, recordId, 'fashion_accessories');
    await refreshDerivedFacts(svc, recordId, deps);
    expect((await stored(recordId)).category).toMatchObject({
      key: 'fashion_accessories',
      source: 'manual',
    });
    await setInterview(recordId, { nature_of_business: 'ขายบ้าน' });
    await refreshDerivedFacts(svc, recordId, deps);
    // A page-text update never silently changes staff's revenue category.
    expect((await stored(recordId)).category).toMatchObject({
      status: 'mapped',
      source: 'manual',
      key: 'fashion_accessories',
      candidate_key: null,
    });
  });

  it('refuses a category that is not in the dictionary', async () => {
    await expect(setBusinessCategory(svc, recordId, 'no_such_key')).rejects.toThrow(
      'unknown-category',
    );
  });

  it('does not auto-map categories even when a mapper is configured', async () => {
    await setInterview(recordId, { nature_of_business: 'ขายเสื้อผ้าออนไลน์' });
    await updateStructuredData(svc, recordId, (current) => ({ ...current, category: null }));
    await refreshDerivedFacts(svc, recordId, { mapper: null });
    expect((await stored(recordId)).category).toMatchObject({
      status: 'unmapped',
      error: 'choose-category',
    });
    await remapBusinessCategory(svc, recordId, deps);
    expect((await stored(recordId)).category).toMatchObject({ status: 'unmapped' });
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
      await expect(refreshDerivedFacts(svc, data.id, { mapper: broken })).resolves.toBe('updated');
      const s = await stored(data.id);
      expect(s.address).toMatchObject({ status: 'resolved', postcode: '45110' });
      expect(s.category).toMatchObject({ status: 'unmapped', error: 'choose-category' });
    } finally {
      await svc.from('dbd_records').delete().eq('id', data.id);
    }
  });

  it('caches Apify Facebook text until the Page link changes or a refresh is requested', async () => {
    const { data, error } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท เฟซบุ๊ก จำกัด',
        head_office_address: ROI_ET,
        facebook_page: 'https://www.facebook.com/firstshop',
        created_by: owner.id,
      })
      .select('id')
      .single();
    if (error) throw error;
    const readFacebook = vi.fn(async (url: string) => `Page details for ${url}`);
    const facebookDeps = {
      mapper: null,
      readFacebook,
      describe: async () => ({ nature: 'ค้าปลีก', products: 'เครื่องเขียน', confidence: 0.8 }),
    };
    try {
      await refreshDerivedFacts(svc, data.id, facebookDeps);
      await refreshDerivedFacts(svc, data.id, facebookDeps);
      expect(readFacebook).toHaveBeenCalledTimes(1);
      expect((await stored(data.id)).facebook_source).toMatchObject({ status: 'read' });
      await svc
        .from('dbd_records')
        .update({ facebook_page: 'https://www.facebook.com/secondshop' })
        .eq('id', data.id);
      await refreshDerivedFacts(svc, data.id, facebookDeps);
      expect(readFacebook).toHaveBeenCalledTimes(2);
      await refreshDerivedFacts(svc, data.id, facebookDeps, { refreshFacebook: true });
      expect(readFacebook).toHaveBeenCalledTimes(3);
    } finally {
      await svc.from('dbd_records').delete().eq('id', data.id);
    }
  });

  it('does not repeatedly charge for an unreadable Facebook Page during the same day', async () => {
    const { data, error } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท เฟซบุ๊กไม่พร้อม จำกัด',
        head_office_address: ROI_ET,
        facebook_page: 'https://www.facebook.com/unavailable',
        created_by: owner.id,
      })
      .select('id')
      .single();
    if (error) throw error;
    const readFacebook = vi.fn(async () => null);
    try {
      await refreshDerivedFacts(svc, data.id, {
        mapper: null,
        readFacebook,
        now: () => new Date('2026-10-09T00:00:00Z'),
      });
      await refreshDerivedFacts(svc, data.id, {
        mapper: null,
        readFacebook,
        now: () => new Date('2026-10-09T01:00:00Z'),
      });
      expect(readFacebook).toHaveBeenCalledTimes(1);
      expect((await stored(data.id)).facebook_source).toMatchObject({ status: 'unavailable' });
      await refreshDerivedFacts(svc, data.id, {
        mapper: null,
        readFacebook,
        now: () => new Date('2026-10-10T01:00:00Z'),
      });
      expect(readFacebook).toHaveBeenCalledTimes(2);
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
        category: manualCategory('fashion_accessories', 'h', new Date().toISOString()),
      };
    });
    expect(result).toBe('updated');
    const s = await stored(recordId);
    expect(s.interview?.main_clients).toBe('ลูกค้าที่มาระหว่างเขียน');
    expect(s.category).toMatchObject({ key: 'fashion_accessories', source: 'manual' });
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
    expect((await stored(recordId)).category).toMatchObject({ key: 'fashion_accessories' });
  });
});
