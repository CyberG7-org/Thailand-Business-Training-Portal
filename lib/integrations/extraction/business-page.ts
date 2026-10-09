import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const privateV4 = (address: string) => {
  const parts = address.split('.').map(Number);
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] >= 224
  );
};

/** Reads public company pages only; private network addresses and redirects are never fetched. */
export async function readBusinessPage(address: string): Promise<string | null> {
  try {
    const url = new URL(address);
    if (url.protocol !== 'https:' || !url.hostname.includes('.') || isIP(url.hostname)) return null;
    const addresses = await lookup(url.hostname, { all: true });
    if (
      !addresses.length ||
      addresses.some((entry) =>
        entry.family === 4 ? privateV4(entry.address) : !/^[23]/.test(entry.address),
      )
    )
      return null;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      headers: { Accept: 'text/html', 'User-Agent': 'BusinessTrainingPortal/1.0' },
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return null;
    const html = (await response.text()).slice(0, 250_000);
    const descriptions = [
      ...html.matchAll(
        /<meta\s+[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["']/gi,
      ),
    ].map((match) => match[1]);
    const plain = html
      .replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(?:nbsp|amp|quot|lt|gt);/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return [...descriptions, plain].join(' ').slice(0, 12_000) || null;
  } catch {
    return null;
  }
}
