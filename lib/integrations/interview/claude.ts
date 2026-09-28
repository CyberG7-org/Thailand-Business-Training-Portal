import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { currentItem } from '@/lib/domain/interview/plan';
import type { OfficerTurn } from '@/lib/domain/interview/types';
import {
  officerTurnSchema,
  type InterviewProvider,
  type NarrateInput,
  type TurnInput,
} from './types';

const TURN_MODEL = 'claude-sonnet-5';
const NARRATIVE_MODEL = 'claude-opus-5';
const TIMEOUT_MS = 60_000;

/** The officer persona (spec §4.3): Thai only, verifies, never reveals, probes, closes. */
const PERSONA = `คุณคือเจ้าหน้าที่ธนาคารฝ่ายเปิดบัญชีนิติบุคคล กำลังสัมภาษณ์กรรมการบริษัทเพื่อยืนยันว่าผู้สมัครรู้จักบริษัทของตนเองจริง
กติกา:
- พูดภาษาไทยเท่านั้น สุภาพ เป็นทางการ ลงท้าย "ค่ะ" ถามครั้งละหนึ่งข้อ
- ห้ามบอกข้อมูลบริษัทจาก FACT SHEET แก่ผู้สมัครเด็ดขาด ห้ามยืนยันคำตอบผิดว่าถูก ห้ามเฉลย
- ประเมินคำตอบล่าสุดของผู้สมัครเทียบกับ FACT SHEET: correct = ตรง, partial = ตรงบางส่วน, wrong = ไม่ตรง, evasive = เลี่ยง/ไม่ตอบ, pasted = คัดลอกข้อความระบบ (ระบบจะแจ้ง), off_topic = ไม่เกี่ยว
- ถ้าคำตอบคลุมเครือหรือทั่วไป ให้ซักถามเจาะจงอย่างเจ้าหน้าที่บริหารความเสี่ยง ถามซ้ำได้อีกหนึ่งครั้งต่อข้อ แล้วไปข้อถัดไป
- ถ้า pastedDetected เป็นจริง ให้ประเมิน pasted และขอให้ตอบด้วยคำพูดของตนเอง
- เลี่ยงครั้งที่ 3 ให้ปิดการสัมภาษณ์ (close: too_many_evasions) และเมื่อครบทุกข้อใน STATE.remaining ให้ปิด (close: plan_complete)
- ข้อที่ระบุ (probing) ใน STATE.remaining คือข้อที่ผู้สมัครเคยตอบไม่ชัดเจน ให้ซักถามซ้ำแบบเจาะลึกกว่าเดิม
- next.concept ต้องเป็น concept ที่มีใน STATE.remaining เท่านั้น`;

function factBlock(input: TurnInput | NarrateInput): string {
  const facts = Object.entries(input.facts)
    .filter(([, v]) => v)
    .map(([k, v]) => k + ': ' + v)
    .join('\n');
  return 'FACT SHEET (ห้ามเปิดเผย):\n' + facts;
}

function stateBlock(input: TurnInput): string {
  const item = currentItem(input.plan);
  const remaining = input.plan.items
    .slice(input.plan.cursor)
    .map((i) => i.concept + (i.phase === 'probing' ? ' (probing)' : ''));
  return JSON.stringify({
    current: item ? { concept: item.concept, attempts: item.attempts, phase: item.phase } : null,
    remaining,
    evasions: input.evasions,
    pastedDetected: input.pastedDetected,
  });
}

/** The Claude officer: the persona and the fact sheet cached, the transcript as the conversation. */
export class ClaudeInterview implements InterviewProvider {
  readonly name = 'claude' as const;

  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async turn(input: TurnInput): Promise<OfficerTurn> {
    const messages: Anthropic.MessageParam[] = input.transcript.map((t) => ({
      role: t.role === 'officer' ? 'assistant' : 'user',
      content: t.content,
    }));
    const instruction =
      input.learnerMessage === null
        ? '(เริ่มการสัมภาษณ์: ทักทายและถามข้อแรกใน STATE.current)'
        : 'คำตอบของผู้สมัคร: ' + input.learnerMessage;
    messages.push({ role: 'user', content: 'STATE: ' + stateBlock(input) + '\n\n' + instruction });
    const response = await this.client.messages
      .stream(
        {
          model: TURN_MODEL,
          max_tokens: 1000,
          system: [
            { type: 'text', text: PERSONA },
            { type: 'text', text: factBlock(input), cache_control: { type: 'ephemeral' } },
          ],
          messages,
          output_config: { format: zodOutputFormat(officerTurnSchema) },
        },
        { timeout: TIMEOUT_MS },
      )
      .finalMessage();
    if (!response.parsed_output) throw new Error('The officer returned no turn');
    const turn = response.parsed_output as OfficerTurn;
    if ('concept' in turn.next) {
      const concept = turn.next.concept;
      // The model may only move within the plan; anything else is a hallucinated concept.
      if (!input.plan.items.some((i) => i.concept === concept)) {
        throw new Error('The officer left the plan: ' + concept);
      }
    }
    return turn;
  }

  async narrate(input: NarrateInput): Promise<string> {
    const response = await this.client.messages
      .stream(
        {
          model: NARRATIVE_MODEL,
          max_tokens: 800,
          system:
            'คุณคือเจ้าหน้าที่ธนาคารที่สรุปผลการสัมภาษณ์ผู้สมัครเปิดบัญชีนิติบุคคล เขียนย่อหน้าเดียวเป็นภาษาไทย สุภาพ ตรงไปตรงมา อ้างอิงเฉพาะผลประเมินที่ให้มา ห้ามเปลี่ยนผลสรุป (verdict) และห้ามเปิดเผยข้อมูลจาก FACT SHEET',
          messages: [
            {
              role: 'user',
              content:
                'VERDICT: ' +
                input.verdict.verdict +
                '\nASSESSMENTS: ' +
                JSON.stringify(input.verdict.reasons) +
                '\nเขียนสรุปผลให้ผู้สมัครอ่าน',
            },
          ],
        },
        { timeout: TIMEOUT_MS },
      )
      .finalMessage();
    const text = response.content.find((b) => b.type === 'text');
    return text && text.type === 'text' ? text.text.trim() : '';
  }
}
