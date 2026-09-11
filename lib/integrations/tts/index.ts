import 'server-only';
import { ElevenLabsTts } from './elevenlabs';
import { FakeTts } from './fake';
import type { TtsProvider } from './types';

export type TtsProviderName = 'elevenlabs' | 'fake' | 'off';

/**
 * TTS_PROVIDER=elevenlabs|fake|off. Default: elevenlabs when ELEVENLABS_API_KEY is set,
 * otherwise fake outside production and off in production.
 */
export function resolveTtsProvider(
  env: Record<string, string | undefined> = process.env,
): TtsProviderName {
  const configured = env.TTS_PROVIDER;
  if (configured === 'elevenlabs' || configured === 'fake' || configured === 'off')
    return configured;
  if (env.ELEVENLABS_API_KEY) return 'elevenlabs';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

let fake: FakeTts | null = null;

export function getTtsProvider(
  env: Record<string, string | undefined> = process.env,
): TtsProvider | null {
  switch (resolveTtsProvider(env)) {
    case 'elevenlabs':
      return new ElevenLabsTts(
        env.ELEVENLABS_API_KEY ?? '',
        env.ELEVENLABS_VOICE_ID ?? 'default',
        env.ELEVENLABS_MODEL_ID,
      );
    case 'fake':
      fake ??= new FakeTts();
      return fake;
    case 'off':
      return null;
  }
}
