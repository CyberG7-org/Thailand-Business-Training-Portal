import { describe, expect, it, vi } from 'vitest';
import { readFacebookPageWithApify } from '@/lib/integrations/extraction/apify-facebook';

describe('Apify Facebook Page reader', () => {
  it('reads Page details and post text without passing unrelated metadata to the AI', async () => {
    const fetcher = vi.fn(async (endpoint: URL, init: RequestInit) => {
      expect(endpoint.hostname).toBe('api.apify.com');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
      const input = JSON.parse(String(init.body)) as {
        type?: string;
        urls?: string[];
        startUrls?: { url: string }[];
        resultsLimit?: number;
        captionText?: boolean;
      };
      if (input.type === 'page_details') {
        expect(endpoint.pathname).toContain('api-ninja~facebook-pages-scraper');
        expect(input.urls).toEqual(['https://www.facebook.com/example']);
        expect(endpoint.searchParams.get('maxItems')).toBe('1');
      } else {
        expect(endpoint.pathname).toContain('apify~facebook-posts-scraper');
        expect(input.startUrls).toEqual([{ url: 'https://www.facebook.com/example' }]);
        expect(input.resultsLimit).toBe(5);
        expect(input.captionText).toBe(false);
        expect(endpoint.searchParams.get('maxItems')).toBe('5');
      }
      return new Response(
        JSON.stringify(
          input.type === 'page_details'
            ? [
                {
                  name: 'Example Shop',
                  intro: 'We sell stationery in Bangkok',
                  services: ['Office supplies'],
                  email: 'private@example.com',
                },
              ]
            : [{ text: 'New notebooks available', comments: [{ text: 'private comment' }] }],
        ),
        { status: 200 },
      );
    });
    const result = await readFacebookPageWithApify('https://www.facebook.com/example', {
      token: 'test-token',
      fetcher: fetcher as typeof fetch,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toContain('We sell stationery in Bangkok');
    expect(result).toContain('Office supplies');
    expect(result).toContain('New notebooks available');
    expect(result).not.toContain('private@example.com');
    expect(result).not.toContain('private comment');
  });

  it('uses at most five recent posts to identify the business', async () => {
    const fetcher = vi.fn(async (_endpoint: URL, init: RequestInit) => {
      const input = JSON.parse(String(init.body)) as { type: string };
      return new Response(
        JSON.stringify(
          input.type === 'page_details'
            ? []
            : Array.from({ length: 8 }, (_, index) => ({ text: `Product ${index + 1}` })),
        ),
      );
    });
    const result = await readFacebookPageWithApify('https://www.facebook.com/example', {
      token: 'test-token',
      fetcher: fetcher as typeof fetch,
    });
    expect(result).toContain('Product 5');
    expect(result).not.toContain('Product 6');
  });

  it('rejects non-Facebook URLs and empty or failed Actor results', async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify([{ error: 'Page unavailable' }])),
    );
    expect(
      await readFacebookPageWithApify('https://example.com/shop', {
        token: 'test-token',
        fetcher: fetcher as typeof fetch,
      }),
    ).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await readFacebookPageWithApify('https://www.facebook.com/closed', {
        token: 'test-token',
        fetcher: fetcher as typeof fetch,
      }),
    ).toBeNull();
  });
});
