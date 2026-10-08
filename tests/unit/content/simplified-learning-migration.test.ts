import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261008010000_simplified_learning_flow.sql',
  'utf8',
);

describe('simplified learning migration', () => {
  it('owns the transaction needed by its temporary tables', () => {
    expect(migration).toMatch(/\nbegin;\n/i);
    expect(migration.trimEnd()).toMatch(/commit;$/i);
  });

  it('is additive and documents a content-only rollback', () => {
    expect(migration).toContain('-- Rollback (content only):');
    expect(migration).toContain('on conflict (question_key) do update');
    expect(migration).toContain('on conflict (question_id, language) do update');
    expect(migration).not.toMatch(/^\s*(delete|truncate|drop|alter)\b/im);
  });
});
