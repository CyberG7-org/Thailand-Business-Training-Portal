import 'server-only';
import { createSupabaseAdminClient } from './admin';
import { ttsCachePath } from '@/lib/integrations/tts/cache-key';
import type { TtsProvider } from '@/lib/integrations/tts/types';

const SIGNED_URL_SECONDS = 300;
const BUCKET = 'tts-cache';

/**
 * Returns a signed URL for the audio of `text`, synthesizing and caching it on first use.
 * Callers must have already verified the text is approved Thai content (spec §6).
 */
export async function getOrCreateTtsAudioUrl(text: string, provider: TtsProvider): Promise<string> {
  const admin = createSupabaseAdminClient();
  const path = ttsCachePath(text, provider.voiceId);

  const { data: existing } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (existing?.signedUrl) return existing.signedUrl;

  const audio = await provider.synthesize(text);
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
  if (uploadError) throw uploadError;

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}
