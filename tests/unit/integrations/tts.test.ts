import { describe, expect, it } from 'vitest';
import { ttsCachePath } from '@/lib/integrations/tts/cache-key';
import { FakeTts } from '@/lib/integrations/tts/fake';
import { resolveTtsProvider } from '@/lib/integrations/tts/index';

describe('ttsCachePath', () => {
  it('is deterministic and changes with text or voice', () => {
    const a = ttsCachePath('สวัสดี', 'v1');
    expect(a).toBe(ttsCachePath('สวัสดี', 'v1'));
    expect(a).toMatch(/^[0-9a-f]{64}\.mp3$/);
    expect(ttsCachePath('สวัสดีครับ', 'v1')).not.toBe(a);
    expect(ttsCachePath('สวัสดี', 'v2')).not.toBe(a);
  });
});

describe('resolveTtsProvider', () => {
  it('honours an explicit TTS_PROVIDER', () => {
    expect(resolveTtsProvider({ TTS_PROVIDER: 'off', ELEVENLABS_API_KEY: 'k' })).toBe('off');
    expect(resolveTtsProvider({ TTS_PROVIDER: 'fake' })).toBe('fake');
  });
  it('defaults to elevenlabs when a key exists', () => {
    expect(resolveTtsProvider({ ELEVENLABS_API_KEY: 'k' })).toBe('elevenlabs');
  });
  it('defaults to fake outside production and off in production', () => {
    expect(resolveTtsProvider({ NODE_ENV: 'development' })).toBe('fake');
    expect(resolveTtsProvider({ NODE_ENV: 'production' })).toBe('off');
  });
});

describe('FakeTts', () => {
  it('returns MP3 bytes that start with a frame sync and records the text', async () => {
    const tts = new FakeTts();
    const bytes = await tts.synthesize('ทดสอบ');
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1] & 0xe0).toBe(0xe0);
    expect(tts.spoken).toEqual(['ทดสอบ']);
  });
});
