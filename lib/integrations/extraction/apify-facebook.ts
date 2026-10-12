import 'server-only';

import { toFacebookPage } from '@/lib/domain/learner-contact';

const PAGE_DETAILS_ACTOR = 'api-ninja~facebook-pages-scraper';
const POSTS_ACTOR = 'apify~facebook-posts-scraper';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGE_TEXT = 12_000;
const MAX_RECENT_POSTS = 5;

type Fetcher = typeof fetch;
type ActorItem = Record<string, unknown>;

function facebookAddress(input: string): string | null {
  const normalized = toFacebookPage(input);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.hostname.toLowerCase() === 'fb.com') url.hostname = 'www.facebook.com';
  if (
    url.protocol !== 'https:' ||
    !['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname.toLowerCase())
  )
    return null;
  return url.toString();
}

function text(value: unknown, max = 1_200): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function list(value: unknown, max = 12): string[] {
  return Array.isArray(value)
    ? value.slice(0, max).flatMap((item) => {
        const found = text(item, 300);
        return found ? [found] : [];
      })
    : [];
}

function pageDetails(items: ActorItem[]): string[] {
  return items.flatMap((item) => {
    if (item.error || item.success === false) return [];
    const substance = [
      text(item.intro, 1_200),
      text(item.description, 2_000),
      ...list(item.categories),
      ...list(item.services),
    ].filter((line): line is string => Boolean(line));
    if (!substance.length) return [];
    const lines = [text(item.name, 200), ...substance];
    return lines.filter((line): line is string => Boolean(line));
  });
}

function posts(items: ActorItem[]): string[] {
  return items.slice(0, MAX_RECENT_POSTS).flatMap((item) => {
    if (item.error || item.success === false) return [];
    const message = text(item.text, 1_000);
    return message ? [message] : [];
  });
}

async function runActor(
  url: string,
  type: 'page_details' | 'posts',
  token: string,
  fetcher: Fetcher,
): Promise<ActorItem[]> {
  const actor = type === 'posts' ? POSTS_ACTOR : PAGE_DETAILS_ACTOR;
  const endpoint = new URL(`https://api.apify.com/v2/actors/${actor}/run-sync-get-dataset-items`);
  endpoint.searchParams.set('maxItems', type === 'posts' ? String(MAX_RECENT_POSTS) : '1');
  endpoint.searchParams.set('maxTotalChargeUsd', '0.25');
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      type === 'posts'
        ? { startUrls: [{ url }], resultsLimit: MAX_RECENT_POSTS, captionText: false }
        : { urls: [url], type, maxResults: 20, parseAllResults: false },
    ),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Apify ${type} returned ${response.status}`);
  const result: unknown = await response.json();
  if (!Array.isArray(result)) throw new Error(`Apify ${type} returned invalid data`);
  return result.filter(
    (item): item is ActorItem => item !== null && typeof item === 'object' && !Array.isArray(item),
  );
}

/** Public Page text only; no comments, contacts, tokens, or raw Actor JSON reach the AI. */
export async function readFacebookPageWithApify(
  address: string,
  options: { token?: string; fetcher?: Fetcher } = {},
): Promise<string | null> {
  const url = facebookAddress(address);
  const token = options.token ?? process.env.APIFY_API_TOKEN;
  if (!url || !token) return null;
  const fetcher = options.fetcher ?? fetch;
  const results = await Promise.allSettled([
    runActor(url, 'page_details', token, fetcher),
    runActor(url, 'posts', token, fetcher),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') console.error('Apify Facebook read failed', result.reason);
  }
  const details = results[0].status === 'fulfilled' ? pageDetails(results[0].value) : [];
  const recentPosts = results[1].status === 'fulfilled' ? posts(results[1].value) : [];
  if (!details.length && !recentPosts.length) return null;
  return [
    `Facebook Page: ${url}`,
    ...details.map((line) => `Page detail: ${line}`),
    ...recentPosts.map((line) => `Recent Page post: ${line}`),
  ]
    .join('\n')
    .slice(0, MAX_PAGE_TEXT);
}
