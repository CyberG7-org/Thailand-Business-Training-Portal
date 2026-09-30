import { z } from 'zod';
import { normalizeThaiMobile } from './phone';

/**
 * A web address as a person types it: `example.co.th`, `www.example.com/shop` or a full URL.
 * Stored with its scheme so a screen can link it; anything that is not a host with a dot is
 * refused rather than guessed at.
 */
function toWebAddress(input: string): string | null {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes('.') ? url.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/**
 * A Facebook page is its address, or just the page name people know it by (`tharavanich`,
 * `thara.vanich`), which becomes the facebook.com address. A name may contain dots, so only
 * something that names a scheme or a Facebook host is read as an address.
 */
function toFacebookPage(input: string): string | null {
  if (
    /^https?:\/\//i.test(input) ||
    /^(www\.|m\.)?(facebook\.com|fb\.com|fb\.me)(\/|$)/i.test(input)
  ) {
    return toWebAddress(input);
  }
  return /^[\p{L}\p{N}][\p{L}\p{N}.]{1,99}$/u.test(input) && !input.includes('..')
    ? `https://www.facebook.com/${input}`
    : null;
}

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

function optionalAddress(normalize: (s: string) => string | null, message: string) {
  return z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(300, message)
      .transform((v, ctx) => normalize(v) ?? (ctx.addIssue({ code: 'custom', message }), z.NEVER))
      .nullable()
      .default(null),
  );
}

/**
 * The contact details a manager gives a learner (D80). Each issue's message is the field's key,
 * so the form says in the staff member's language which one is wrong. Phone and email are
 * required; the phone is kept in its normalized local form (`0812345678`), which the name card
 * formats.
 */
export const learnerContactSchema = z.object({
  phone: z
    .string()
    .trim()
    .transform(
      (v, ctx) =>
        normalizeThaiMobile(v) ?? (ctx.addIssue({ code: 'custom', message: 'phone' }), z.NEVER),
    ),
  contactEmail: z.string().trim().email('contactEmail').max(320, 'contactEmail'),
  website: optionalAddress(toWebAddress, 'website'),
  facebookPage: optionalAddress(toFacebookPage, 'facebookPage'),
});

export type LearnerContact = z.output<typeof learnerContactSchema>;
export type LearnerContactField = keyof LearnerContact;
export const LEARNER_CONTACT_FIELDS: LearnerContactField[] = [
  'phone',
  'contactEmail',
  'website',
  'facebookPage',
];

/** The contact fields as the shared staff form posts them. */
export function contactFromForm(formData: FormData): Record<LearnerContactField, string> {
  return {
    phone: String(formData.get('phone') ?? ''),
    contactEmail: String(formData.get('contactEmail') ?? ''),
    website: String(formData.get('website') ?? ''),
    facebookPage: String(formData.get('facebookPage') ?? ''),
  };
}

/** The first field the schema refused, for the form to name. */
export function firstContactProblem(error: z.ZodError): LearnerContactField {
  const message = error.issues[0]?.message;
  return (LEARNER_CONTACT_FIELDS as string[]).includes(message ?? '')
    ? (message as LearnerContactField)
    : ((error.issues[0]?.path[0] as LearnerContactField | undefined) ?? 'phone');
}
