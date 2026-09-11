import { createHash } from 'node:crypto';

/** Storage path inside the `tts-cache` bucket for a given text + voice. */
export function ttsCachePath(text: string, voiceId: string): string {
  const hash = createHash('sha256').update(`${voiceId}\n${text}`).digest('hex');
  return `${hash}.mp3`;
}
