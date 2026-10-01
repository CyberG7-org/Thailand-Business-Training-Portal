/**
 * The "Create learner" form's own rules, kept apart from the page so they can be tested: what
 * must be filled before the button wakes, and the starting password it can generate.
 */

/** The shortest initial password the server accepts (`newAccountSchema`). */
export const MIN_PASSWORD_LENGTH = 10;

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
    { item: 'password', done: values.password.length >= MIN_PASSWORD_LENGTH },
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
 * A starting password for the manager to hand over: three groups of four, e.g. `Kp7w-Xm3r-Tz9q`
 * — fourteen characters, past the minimum, and easy to read out. `random` returns a whole
 * number below its argument; the default draws from the browser's or Node's crypto.
 */
export function generatePassword(
  random: (below: number) => number = (below) =>
    crypto.getRandomValues(new Uint32Array(1))[0] % below,
): string {
  const group = () =>
    Array.from({ length: 4 }, () => PASSWORD_CHARS[random(PASSWORD_CHARS.length)]).join('');
  return [group(), group(), group()].join('-');
}
