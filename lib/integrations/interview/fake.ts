import { currentItem } from '@/lib/domain/interview/plan';
import type { Assessment, OfficerTurn } from '@/lib/domain/interview/types';
import type { InterviewProvider, NarrateInput, TurnInput } from './types';

const MAX_EVASIONS = 3;
const EVASIVE = /ไม่ทราบ|ไม่รู้|ไม่แน่ใจ/;

const NOTE: Record<Assessment['verdict'], string> = {
  correct: 'ตรงกับหนังสือรับรอง',
  partial: 'ตอบได้บางส่วน',
  wrong: 'ไม่ตรงกับหนังสือรับรอง',
  evasive: 'ไม่ได้ตอบคำถาม',
  pasted: 'คัดลอกข้อความจากระบบ',
  off_topic: 'ไม่เกี่ยวกับคำถาม',
};

function norm(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\s,.\-/]/g, '')
    .toLowerCase();
}

const AMOUNT = /\d[\d,]*(?:\.\d+)?/g;
const TOLERANCE = 0.2;

/** The figures in a sentence; a count such as "5 ใบ" is below the floor and ignored. */
function amountsIn(s: string): number[] {
  return (s.match(AMOUNT) ?? [])
    .map((m) => Number(m.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n >= 10);
}

/**
 * The Owner's tolerance for an amount (D101): within 20% of the expected figure, or inside the
 * expected range. Only a money fact is graded this way, so an ID number is never close enough.
 */
export function amountMatches(answer: string, expected: string): boolean {
  if (!/บาท/.test(expected)) return false;
  const given = amountsIn(answer);
  const wanted = amountsIn(expected);
  if (given.length === 0 || wanted.length === 0) return false;
  if (wanted.length >= 2 && /ระหว่าง|ถึง|–/.test(expected)) {
    const low = Math.min(...wanted);
    const high = Math.max(...wanted);
    return given.some((a) => a >= low && a <= high);
  }
  return given.some((a) => wanted.some((e) => Math.abs(a - e) <= e * TOLERANCE));
}

/**
 * The deterministic officer for the suites: asks the plan's Thai questions in order, judges an
 * answer by whether it carries the record's value, asks once more, and closes when the plan ends
 * or the third evasion comes. It never says a fact.
 */
export class FakeInterview implements InterviewProvider {
  readonly name = 'fake' as const;

  async turn(input: TurnInput): Promise<OfficerTurn> {
    const item = currentItem(input.plan);
    if (input.learnerMessage === null || !item) {
      const first = input.plan.items[0];
      return {
        say:
          'สวัสดีค่ะ ดิฉันเป็นเจ้าหน้าที่ธนาคาร ขอสอบถามข้อมูลบริษัทนะคะ ' +
          (first?.question ?? ''),
        assessment: null,
        next: first ? { concept: first.concept } : { close: 'plan_complete' },
      };
    }
    const message = input.learnerMessage;
    let verdict: Assessment['verdict'];
    if (input.pastedDetected) verdict = 'pasted';
    else {
      const answer = norm(message);
      const parts = item.expected.split(' / ');
      const expected = parts.map(norm);
      const matches =
        expected.some(
          (e) =>
            e.length > 0 &&
            (answer.includes(e) ||
              (e.includes(answer) && answer.length >= Math.ceil(e.length * 0.6))),
        ) || parts.some((e) => amountMatches(message, e));
      if (matches) verdict = 'correct';
      else if (message.trim().length < 3 || EVASIVE.test(message)) verdict = 'evasive';
      else verdict = 'wrong';
    }
    const assessment: Assessment = { concept: item.concept, verdict, note: NOTE[verdict] };
    const evasions = input.evasions + (verdict === 'evasive' ? 1 : 0);
    if (evasions >= MAX_EVASIONS) {
      return {
        say: 'ขออภัยค่ะ วันนี้ธนาคารยังไม่สามารถดำเนินการต่อได้ ขอบคุณที่มาค่ะ',
        assessment,
        next: { close: 'too_many_evasions' },
      };
    }
    const stay = verdict !== 'correct' && item.attempts < 1;
    if (stay) {
      const ask = verdict === 'pasted' ? 'กรุณาตอบด้วยคำพูดของคุณเองนะคะ ' : 'ขอถามอีกครั้งนะคะ ';
      return { say: ask + item.question, assessment, next: { concept: item.concept } };
    }
    const next = input.plan.items[input.plan.cursor + 1];
    if (!next) {
      return {
        say: 'ขอบคุณค่ะ ครบทุกข้อแล้ว ธนาคารจะสรุปผลให้นะคะ',
        assessment,
        next: { close: 'plan_complete' },
      };
    }
    const lead = next.phase === 'probing' ? 'ขอกลับมาที่ข้อนี้อีกครั้งนะคะ ' : 'รับทราบค่ะ ';
    return { say: lead + next.question, assessment, next: { concept: next.concept } };
  }

  async narrate(input: NarrateInput): Promise<string> {
    const weak = input.verdict.reasons.filter((r) => r.verdict !== 'correct').map((r) => r.concept);
    return input.verdict.verdict === 'ready'
      ? 'ผู้สมัครตอบคำถามเกี่ยวกับบริษัทได้ถูกต้องและครบถ้วน ธนาคารประเมินความเสี่ยงต่ำ'
      : 'ผู้สมัครยังตอบคำถามบางข้อไม่ได้หรือไม่ชัดเจน (' +
          weak.join(', ') +
          ') ธนาคารยังไม่สามารถดำเนินการต่อได้ในวันนี้';
  }
}
