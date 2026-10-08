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
    expect(migration).toMatch(/-- Rollback \(content only\):\n--   begin;[\s\S]*?--   commit;/);
    expect(migration).toContain('on conflict (question_key) do update');
    expect(migration).toContain('on conflict (question_id, language) do update');
    expect(migration).not.toMatch(/^\s*(delete|truncate|drop|alter)\b/im);
  });

  it('preserves every legacy approval state for an exact rollback', () => {
    expect(migration).toContain('private.content_migration_question_states');
    expect(migration).toContain(
      "previous.migration_key = '20261008010000_simplified_learning_flow'",
    );
    expect(migration).toContain('previous.approval_status');
    expect(migration).toContain('on conflict (migration_key, question_id) do nothing');
    expect(migration).not.toMatch(
      /update public\.questions set approval_status = 'approved'\s+where concept_key is not null/i,
    );
  });
});
