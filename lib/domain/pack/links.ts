import { toFacebookPage, toWebAddress } from '@/lib/domain/learner-contact';

export type PackLinks = { website: string | null; facebook: string | null };

const ADDRESS = /(?:https?:\/\/|www\.)[^\s"'<>()\]\u0000]+/gi;
const FACEBOOK = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:facebook\.com|fb\.com|fb\.me)(?:\/|$)/i;

/**
 * The company's addresses in a link file's text (spec 2026-10-06 §2): the first Facebook address
 * is the page, the first other web address the website. Nothing else in the text is kept.
 */
export function linksFromText(text: string): PackLinks {
  let website: string | null = null;
  let facebook: string | null = null;
  for (const match of text.matchAll(ADDRESS)) {
    const raw = match[0].replace(/[.,;:!?)]+$/, '');
    if (FACEBOOK.test(raw)) {
      facebook ??= toFacebookPage(raw)?.replace(/\/$/, '') ?? null;
    } else {
      website ??= toWebAddress(raw);
    }
    if (website && facebook) break;
  }
  return { website, facebook };
}

/** Several link files: the first address of each kind wins. */
export function mergeLinks(found: readonly PackLinks[]): PackLinks {
  return {
    website: found.find((l) => l.website)?.website ?? null,
    facebook: found.find((l) => l.facebook)?.facebook ?? null,
  };
}
