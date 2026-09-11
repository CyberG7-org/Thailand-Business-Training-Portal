export interface TtsProvider {
  readonly name: string;
  /** Identifies the voice so cached audio is keyed by text + voice. */
  readonly voiceId: string;
  /** Returns MP3 bytes for approved Thai text. */
  synthesize(text: string): Promise<Uint8Array>;
}

export class TtsError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_configured' | 'provider',
  ) {
    super(message);
    this.name = 'TtsError';
  }
}
