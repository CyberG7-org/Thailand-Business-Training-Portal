import type { TtsProvider } from './types';

// One valid, silent MPEG-1 Layer III frame (44.1 kHz, 32 kbps, mono) repeated a few times so
// browsers accept it as an MP3. Used in dev and tests when no provider key exists.
const SILENT_FRAME = Uint8Array.from([
  0xff,
  0xfb,
  0x50,
  0xc4,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  ...new Array(88).fill(0),
]);

export class FakeTts implements TtsProvider {
  readonly name = 'fake';
  readonly voiceId = 'fake-voice';
  /** Text is recorded so tests can assert what would have been spoken. */
  readonly spoken: string[] = [];

  async synthesize(text: string): Promise<Uint8Array> {
    this.spoken.push(text);
    const out = new Uint8Array(SILENT_FRAME.length * 10);
    for (let i = 0; i < 10; i++) out.set(SILENT_FRAME, i * SILENT_FRAME.length);
    return out;
  }
}
