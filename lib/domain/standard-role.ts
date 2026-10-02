import type { LearnerRole } from './bank-interview';
import { readStructuredData } from './dbd-profile';
import type { Director } from './dbd-record';

/**
 * The learner's role answers that are the same for every learner (Owner, 2026-10-02, D94):
 * the learner is a director who oversees the operations and is a friend of the other
 * shareholders. Thai, as every fact is.
 */
export const FIXED_ROLE = {
  position: 'กรรมการ',
  responsibilities: 'ดูแลการดำเนินงานของบริษัท',
  relationship_to_shareholders: 'เพื่อน',
} as const;

/**
 * The role a learner is taught: the three fixed answers, and a name that is a name in the DBD
 * documents — the one a manager picked, or the company's only director (a company has one
 * learner, and the learner is a director). With several directors and none picked there is no
 * name yet; nobody guesses which one the learner is. Whatever was typed earlier for the three
 * fixed answers stays stored and is not read.
 */
export function withStandardRole(
  role: Pick<LearnerRole, 'holder_name'>,
  company: { directors: readonly string[] },
): LearnerRole {
  const picked = role.holder_name?.trim() || null;
  const directors = company.directors.map((name) => name.trim()).filter(Boolean);
  return {
    holder_name: picked ?? (directors.length === 1 ? directors[0] : null),
    ...FIXED_ROLE,
  };
}

const compact = (name: string) => name.replace(/\s+/g, '');

/** Whether a name is one of the names printed in the DBD documents, spaces aside. */
export function isDbdPerson(name: string, people: readonly string[]): boolean {
  return people.some((person) => compact(person) === compact(name));
}

/**
 * The names printed in a record's documents: its directors, then the shareholders who are not
 * directors, each once.
 */
export function dbdPeople(record: { directors: unknown; structured_data: unknown } | null): {
  directors: string[];
  people: string[];
} {
  if (!record) return { directors: [], people: [] };
  const clean = (names: (string | null | undefined)[]) =>
    names.map((n) => n?.trim() ?? '').filter((n, i, all) => n && all.indexOf(n) === i);
  const directors = clean(
    (Array.isArray(record.directors) ? (record.directors as Director[]) : []).map((d) => d.name_th),
  );
  const holders = (readStructuredData(record.structured_data).business?.shareholders ?? []).map(
    (h) => h.name,
  );
  return { directors, people: clean([...directors, ...holders]) };
}
