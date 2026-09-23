import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { adminClient } from './helpers';

const svc = adminClient();

async function allocate(scope: string, prefix: string): Promise<string> {
  const { data, error } = await svc.rpc('allocate_login_id', {
    p_scope: scope,
    p_prefix: prefix,
  });
  if (error) throw error;
  return data as string;
}

describe('allocate_login_id', () => {
  const scopes: string[] = [];
  afterAll(async () => {
    await svc.from('login_id_counters').delete().in('scope', scopes);
  });

  it('counts from one, pads to two digits and grows past 99', async () => {
    const scope = `test-${randomUUID()}`;
    scopes.push(scope);
    expect(await allocate(scope, 't')).toBe('t01');
    expect(await allocate(scope, 't')).toBe('t02');
    await svc.from('login_id_counters').update({ next_value: 99 }).eq('scope', scope);
    expect(await allocate(scope, 't')).toBe('t99');
    expect(await allocate(scope, 't')).toBe('t100');
  });

  it('keeps a counter per team and never repeats under concurrency', async () => {
    const team = `test-${randomUUID()}`;
    const other = `test-${randomUUID()}`;
    scopes.push(team, other);
    const codes = await Promise.all(Array.from({ length: 10 }, () => allocate(team, 't01-')));
    expect(new Set(codes).size).toBe(10);
    expect(codes.sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `t01-${String(i + 1).padStart(2, '0')}`).sort(),
    );
    expect(await allocate(other, 't02-')).toBe('t02-01');
  });

  it('stores the code lower-case whatever case the prefix is given in', async () => {
    const scope = `test-${randomUUID()}`;
    scopes.push(scope);
    expect(await allocate(scope, 'T')).toBe('t01');
    expect(await allocate(scope, 'T01-')).toBe('t01-02');
  });

  it('never reissues a number after the account that held it is gone', async () => {
    const scope = `test-${randomUUID()}`;
    scopes.push(scope);
    expect(await allocate(scope, 't')).toBe('t01');
    expect(await allocate(scope, 't')).toBe('t02');
    // Deleting accounts does not touch the counter, so the next code is t03.
    expect(await allocate(scope, 't')).toBe('t03');
  });
});
