import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backfillPrimaryCategories, restoreBackfilledCategory } from '@/lib/db/category-backfill';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { adminClient, createTestUser, deleteTestUser, type TestUser } from './helpers';

const db = adminClient();

describe('safe category backfill', () => {
  let owner: TestUser;
  const ids: string[] = [];
  beforeAll(async () => {
    owner = await createTestUser('admin');
  });
  afterAll(async () => {
    for (const id of ids) await db.from('dbd_records').delete().eq('id', id);
    await deleteTestUser(owner.id);
  });

  it('dry-runs without writing, then reclassifies an auto decision and skips a manual override', async () => {
    for (const [name, source] of [
      ['auto', 'auto'],
      ['manual', 'manual'],
    ] as const) {
      const { data, error } = await db
        .from('dbd_records')
        .insert({
          company_name_th: `บริษัท backfill ${name} จำกัด`,
          created_by: owner.id,
          structured_data: {
            source_image: {
              path: `${name}/company-profile.png`,
              mime_type: 'image/png',
              reviewed: true,
            },
            interview: {
              nature_of_business: 'จำหน่ายเครื่องครัว',
              products_services: 'เครื่องครัวและเครื่องเขียน',
            },
            category: {
              key: 'home_kitchen_supplies',
              candidate_key: null,
              confidence: source === 'manual' ? null : 0.95,
              source,
              status: 'mapped',
              model: source === 'manual' ? null : 'rules-v1',
              input_hash: 'old',
              error: null,
              decided_at: '2026-10-01T00:00:00Z',
            },
          } as never,
        })
        .select('id')
        .single();
      if (error) throw error;
      ids.push(data.id);
    }
    const dry = await backfillPrimaryCategories(db, { recordIds: ids });
    expect(dry).toMatchObject({ considered: 2, pending: 1, applied: 0, skippedManual: 1 });
    const before = await db.from('dbd_records').select('structured_data').eq('id', ids[0]).single();
    expect(readStructuredData(before.data?.structured_data).category?.key).toBe(
      'home_kitchen_supplies',
    );
    const applied = await backfillPrimaryCategories(db, { recordIds: ids, apply: true });
    expect(applied).toMatchObject({ considered: 2, pending: 1, applied: 1, skippedManual: 1 });
    const after = await db.from('dbd_records').select('structured_data').eq('id', ids[0]).single();
    expect(readStructuredData(after.data?.structured_data).category).toMatchObject({
      key: 'household_office_kitchen',
      model: 'rules-v2',
    });
    expect(
      readStructuredData(after.data?.structured_data).category_backfill_previous,
    ).toMatchObject({
      key: 'home_kitchen_supplies',
      model: 'rules-v1',
    });
    const manual = await db.from('dbd_records').select('structured_data').eq('id', ids[1]).single();
    expect(readStructuredData(manual.data?.structured_data).category).toMatchObject({
      key: 'home_kitchen_supplies',
      source: 'manual',
    });
    expect(await backfillPrimaryCategories(db, { recordIds: ids, apply: true })).toMatchObject({
      pending: 0,
      applied: 0,
    });
    expect(await restoreBackfilledCategory(db, ids[0])).toBe('updated');
    const restored = await db
      .from('dbd_records')
      .select('structured_data')
      .eq('id', ids[0])
      .single();
    expect(readStructuredData(restored.data?.structured_data).category).toMatchObject({
      key: 'home_kitchen_supplies',
      model: 'rules-v1',
    });
  });

  it('keeps an old seafood record’s existing illustrative figure reference after category consolidation', async () => {
    const { data, error } = await db
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท backfill seafood จำกัด',
        created_by: owner.id,
        structured_data: {
          source_image: {
            path: 'seafood/company-profile.png',
            mime_type: 'image/png',
            reviewed: true,
          },
          interview: { nature_of_business: 'จำหน่ายอาหารทะเล', products_services: 'อาหารทะเล' },
          category: {
            key: 'seafood',
            candidate_key: null,
            confidence: 0.95,
            source: 'auto',
            status: 'mapped',
            model: 'rules-v1',
            input_hash: 'old',
            error: null,
            decided_at: '2026-10-01T00:00:00Z',
          },
        } as never,
      })
      .select('id')
      .single();
    if (error) throw error;
    ids.push(data.id);
    await backfillPrimaryCategories(db, { recordIds: [data.id], apply: true });
    const row = await db.from('dbd_records').select('structured_data').eq('id', data.id).single();
    expect(readStructuredData(row.data?.structured_data).category).toMatchObject({
      key: 'food_agricultural_trading',
      legacy_figures_key: 'seafood',
    });
  });
});
