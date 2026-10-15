import { describe, expect, it, vi } from 'vitest';
import { cachedFactTranslationsFor } from '@/lib/db/fact-translations';

function cacheRow(row: { translations: Record<string, string> } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle,
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  return { db: { from } as never, from, query };
}

describe('prepared company fact translations', () => {
  it('reads a matching cached translation without generating one', async () => {
    const { db, from, query } = cacheRow({
      translations: { nature_of_business: 'Furniture trade' },
    });
    const result = await cachedFactTranslationsFor(
      db,
      'version-1',
      { nature_of_business: 'จำหน่ายเฟอร์นิเจอร์' },
      'en',
    );
    expect(result).toEqual({ nature_of_business: 'Furniture trade' });
    expect(from).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenCalledWith('training_version_id', 'version-1');
    expect(query.eq).toHaveBeenCalledWith('locale', 'en');
    expect(query.eq).toHaveBeenCalledWith('source_hash', expect.stringMatching(/^[a-f0-9]{64}$/));
  });

  it('returns empty facts immediately when no prepared translation exists', async () => {
    const { db, query } = cacheRow(null);
    expect(
      await cachedFactTranslationsFor(db, 'version-1', { products_services: 'เครื่องครัว' }, 'zh'),
    ).toEqual({});
    expect(query.maybeSingle).toHaveBeenCalledOnce();
  });

  it('does not query when there are no Thai facts to translate', async () => {
    const { db, from } = cacheRow(null);
    expect(
      await cachedFactTranslationsFor(db, 'version-1', { products_services: 'Furniture' }, 'en'),
    ).toEqual({});
    expect(from).not.toHaveBeenCalled();
  });
});
