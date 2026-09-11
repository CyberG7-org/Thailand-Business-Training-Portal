import 'server-only';
import { TtsError, type TtsProvider } from './types';

const DEFAULT_MODEL = 'eleven_multilingual_v2';

/** ElevenLabs text-to-speech over REST; multilingual v2 covers Thai. */
export class ElevenLabsTts implements TtsProvider {
  readonly name = 'elevenlabs';
  readonly voiceId: string;

  constructor(
    private readonly apiKey: string,
    voiceId: string,
    private readonly modelId: string = DEFAULT_MODEL,
  ) {
    this.voiceId = voiceId;
  }

  async synthesize(text: string): Promise<Uint8Array> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({ text, model_id: this.modelId }),
      },
    );
    if (response.status === 401)
      throw new TtsError('ElevenLabs API key rejected', 'not_configured');
    if (!response.ok) {
      throw new TtsError(
        `ElevenLabs error ${response.status}: ${await response.text()}`,
        'provider',
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}
