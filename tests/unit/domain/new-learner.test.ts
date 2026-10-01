import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  generatePassword,
  newLearnerChecklist,
  secureIndex,
  type NewLearnerValues,
} from '@/lib/domain/new-learner';

const filled: NewLearnerValues = {
  team: 'team-id',
  company: 'record-id',
  password: 'Kp7w-Xm3r-Tz9q',
  name: 'สมชาย ใจดี',
  phone: '081-234-5678',
  email: 'somchai@example.co.th',
  emailValid: true,
};

const doneOf = (values: NewLearnerValues, needsTeam = false) =>
  Object.fromEntries(
    newLearnerChecklist(values, { needsTeam }).map(({ item, done }) => [item, done]),
  );

describe('newLearnerChecklist', () => {
  it('lists company, password, name and contact for a manager, all done when filled', () => {
    const list = newLearnerChecklist(filled, { needsTeam: false });
    expect(list.map((i) => i.item)).toEqual(['company', 'password', 'name', 'contact']);
    expect(list.every((i) => i.done)).toBe(true);
  });

  it('asks the owner for a team first', () => {
    const list = newLearnerChecklist({ ...filled, team: '' }, { needsTeam: true });
    expect(list[0]).toEqual({ item: 'team', done: false });
  });

  it('wants a password of at least the server minimum', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(doneOf({ ...filled, password: 'x'.repeat(9) }).password).toBe(false);
    expect(doneOf({ ...filled, password: 'x'.repeat(10) }).password).toBe(true);
  });

  it('does not count a name of spaces', () => {
    expect(doneOf({ ...filled, name: '   ' }).name).toBe(false);
  });

  it('needs both a phone and a well-formed email for contact', () => {
    expect(doneOf({ ...filled, phone: '' }).contact).toBe(false);
    expect(doneOf({ ...filled, email: '' }).contact).toBe(false);
    expect(doneOf({ ...filled, email: 'not-an-email', emailValid: false }).contact).toBe(false);
  });

  it('marks nothing done on an empty form', () => {
    const empty = { team: '', company: '', password: '', name: '', phone: '', email: '' };
    const list = newLearnerChecklist({ ...empty, emailValid: true }, { needsTeam: true });
    expect(list.some((i) => i.done)).toBe(false);
  });
});

describe('generatePassword', () => {
  it('makes three groups of four from readable characters, past the minimum', () => {
    let n = 0;
    const password = generatePassword((below) => n++ % below);
    expect(password).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
    expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(password).not.toMatch(/[01OIl]/);
  });

  it('differs from one call to the next with the real random source', () => {
    const seen = new Set(Array.from({ length: 20 }, () => generatePassword()));
    expect(seen.size).toBe(20);
  });
});

describe('secureIndex', () => {
  it('stays below its bound and reaches every value', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const n = secureIndex(54);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(54);
      seen.add(n);
    }
    expect(seen.size).toBe(54);
  });

  it('is not tilted towards low values: each half is drawn about as often', () => {
    let low = 0;
    const draws = 20_000;
    for (let i = 0; i < draws; i++) if (secureIndex(54) < 27) low++;
    // A remainder of a byte would put about 52% in the low half; even draws stay near 50%.
    expect(low / draws).toBeGreaterThan(0.47);
    expect(low / draws).toBeLessThan(0.53);
  });
});
