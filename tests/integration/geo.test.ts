import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers';

const svc = adminClient();

type GeoTable = 'geo_regions' | 'geo_provinces' | 'geo_districts' | 'geo_subdistricts';

async function count(table: GeoTable): Promise<number | null> {
  const { count: n, error } = await svc.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return n;
}

/** The geography is reference data (spec 2026-09-30 §5.2): the whole country, read-only. */
describe('Thai geography', () => {
  let learner: TestUser;
  beforeAll(async () => {
    learner = await createTestUser('learner');
  });
  afterAll(async () => {
    await deleteTestUser(learner.id);
  });

  it('holds the whole country from the pinned dataset', async () => {
    expect(await count('geo_regions')).toBe(6);
    expect(await count('geo_provinces')).toBe(77);
    expect(await count('geo_districts')).toBe(930);
    expect(await count('geo_subdistricts')).toBe(7436);
  });

  it('chains Nong Yai to Phon Thong to Roi Et, postcode 45110', async () => {
    const { data: province } = await svc
      .from('geo_provinces')
      .select('id, region_id, name_en')
      .eq('name_th', 'ร้อยเอ็ด')
      .single();
    expect(province).toMatchObject({ region_id: 3, name_en: 'Roi Et' });
    const { data: district } = await svc
      .from('geo_districts')
      .select('id, prefix_th')
      .eq('province_id', province!.id)
      .eq('name_th', 'โพนทอง')
      .single();
    expect(district!.prefix_th).toBe('อำเภอ');
    const { data: subdistrict } = await svc
      .from('geo_subdistricts')
      .select('postcode, name_en')
      .eq('district_id', district!.id)
      .eq('name_th', 'หนองใหญ่')
      .single();
    expect(subdistrict).toEqual({ postcode: '45110', name_en: 'Nong Yai' });
  });

  it('is read by any signed-in user and by nobody anonymous', async () => {
    const { data } = await (
      await clientFor(learner)
    )
      .from('geo_provinces')
      .select('id')
      .eq('name_th', 'กรุงเทพมหานคร');
    expect(data).toHaveLength(1);
    const { data: anon } = await anonClient().from('geo_provinces').select('id').limit(1);
    expect(anon).toEqual([]);
  });

  it('is never written by a signed-in user', async () => {
    const { error } = await (
      await clientFor(learner)
    )
      .from('geo_regions')
      .insert({ id: 99, name_th: 'ทดสอบ', name_en: 'Test' });
    expect(error?.code).toBe('42501');
  });
});
