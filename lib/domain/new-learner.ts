/**
 * The "Create learner" form's own rules, kept apart from the page so they can be tested: what
 * must be filled before the button wakes, and the starting password it can generate.
 */

/** The shortest initial password the server accepts (`newAccountSchema`). */
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 8;
export const LEARNER_PASSWORD_PATTERN = /^[a-z0-9]{6,8}$/i;

/** What the "Before you create" list ticks off; `team` only when the owner picks one. */
export type ChecklistItem = 'team' | 'company' | 'password' | 'name' | 'contact';

export type NewLearnerValues = {
  team: string;
  company: string;
  password: string;
  name: string;
  phone: string;
  email: string;
  /** Whether the browser finds the email well formed (`input.validity.valid`). */
  emailValid: boolean;
};

/**
 * Each item and whether it is done, in the order the list shows them. The server checks all of
 * this again, and more (a Thai mobile number, a free login ID); the list only says what is
 * still missing.
 */
export function newLearnerChecklist(
  values: NewLearnerValues,
  { needsTeam }: { needsTeam: boolean },
): { item: ChecklistItem; done: boolean }[] {
  const items: { item: ChecklistItem; done: boolean }[] = [];
  if (needsTeam) items.push({ item: 'team', done: values.team !== '' });
  items.push(
    { item: 'company', done: values.company !== '' },
    { item: 'password', done: LEARNER_PASSWORD_PATTERN.test(values.password) },
    { item: 'name', done: values.name.trim() !== '' },
    {
      item: 'contact',
      done: values.phone.trim() !== '' && values.email.trim() !== '' && values.emailValid,
    },
  );
  return items;
}

// No 0/O, 1/l/I: read aloud or copied from paper, they are mistaken for each other.
const PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A whole number below `below` (at most 256), every value equally likely: a random byte past the
 * last whole multiple of `below` is drawn again, and the rest are divided down — a plain
 * remainder would favour the low values.
 */
export function secureIndex(below: number): number {
  const span = Math.floor(256 / below);
  const limit = span * below;
  const byte = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(byte);
    if (byte[0] < limit) return Math.floor(byte[0] / span);
  }
}

/**
 * An eight-character starting password for the manager to hand over. `random` returns a whole
 * number below its argument; the default draws evenly from the browser's or Node's crypto.
 */
export function generatePassword(random: (below: number) => number = secureIndex): string {
  return Array.from({ length: 8 }, () => PASSWORD_CHARS[random(PASSWORD_CHARS.length)]).join('');
}
