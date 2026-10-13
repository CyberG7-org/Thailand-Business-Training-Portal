import { type OfficerTurn } from '@/lib/domain/interview/types';
import { currentItem } from '@/lib/domain/interview/plan';
import { PERSONA, factBlock, stateBlock } from './claude';
import {
  officerTurnSchema,
  type InterviewProvider,
  type NarrateInput,
  type TurnInput,
} from './types';

const MODEL = process.env.GEMINI_INTERVIEW_MODEL || 'gemini-3.8-flash';
const TIMEOUT_MS = 60_000;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

/** Google AI Studio's Gemini API; only the interview uses this key. */
export class GeminiInterview implements InterviewProvider {
  readonly name = 'gemini' as const;

  constructor(
    private readonly apiKey: string | undefined = process.env.GEMINI_API_KEY,
    private readonly request: typeof fetch = fetch,
  ) {}

  private async generate(body: Record<string, unknown>): Promise<string> {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY is required for the interview');
    const response = await this.request(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    // Do not include the remote body in errors: it can contain company facts or request details.
    if (!response.ok) throw new Error(`Gemini interview request failed (${response.status})`);
    const result = (await response.json()) as GeminiResponse;
    const text = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text) throw new Error('Gemini interview returned no text');
    return text;
  }

  async turn(input: TurnInput): Promise<OfficerTurn> {
    const contents = input.transcript.map((turn) => ({
      role: turn.role === 'officer' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    }));
    const instruction =
      input.learnerMessage === null
        ? '(เริ่มการสัมภาษณ์: ทักทายและถามข้อแรกใน STATE.current)'
        : 'คำตอบของผู้สมัคร: ' + input.learnerMessage;
    contents.push({
      role: 'user',
      parts: [
        { text: 'STATE: ' + stateBlock(input) + '\n\n' + instruction + '\nตอบเป็น JSON เท่านั้น' },
      ],
    });
    const text = await this.generate({
      systemInstruction: { parts: [{ text: PERSONA + '\n\n' + factBlock(input) }] },
      contents,
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1000 },
    });
    const turn = officerTurnSchema.parse(JSON.parse(text)) as OfficerTurn;
    if ('concept' in turn.next) {
      const concept = turn.next.concept;
      if (!input.plan.items.some((item) => item.concept === concept)) {
        throw new Error('The officer left the plan: ' + concept);
      }
    }
    const current = currentItem(input.plan);
    if (turn.assessment && current && turn.assessment.concept !== current.concept) {
      throw new Error('The officer assessed a different question');
    }
    return turn;
  }

  async narrate(input: NarrateInput): Promise<string> {
    const language = input.language ?? 'th';
    return this.generate({
      systemInstruction: {
        parts: [
          {
            text: `คุณคือเจ้าหน้าที่ธนาคารที่สรุปผลการสัมภาษณ์ผู้สมัครเปิดบัญชีนิติบุคคล เขียนย่อหน้าเดียวในภาษา ${language} (th=ไทย, en=English, zh=简体中文, ms=Bahasa Melayu) สุภาพ ตรงไปตรงมา อ้างอิงเฉพาะผลประเมินที่ให้มา ห้ามเปลี่ยนผลสรุป (verdict) และห้ามเปิดเผยข้อมูลจาก FACT SHEET`,
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                'VERDICT: ' +
                input.verdict.verdict +
                '\nASSESSMENTS: ' +
                JSON.stringify(input.verdict.reasons) +
                '\nเขียนสรุปผลให้ผู้สมัครอ่าน',
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 800 },
    });
  }
}
