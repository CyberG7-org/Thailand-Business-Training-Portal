import {
  currentItem,
  isReadinessPlan,
  questionFor,
  readinessItem,
} from '@/lib/domain/interview/plan';
import { evaluateReadinessAnswer } from '@/lib/domain/interview/answer-validation';
import { OFFICER_COPY } from '@/lib/domain/interview/copy';
import type { Assessment, OfficerTurn } from '@/lib/domain/interview/types';
import type { InterviewProvider, NarrateInput, TurnInput } from './types';

const MAX_EVASIONS = 3;
const EVASIVE = /ไม่ทราบ|ไม่รู้|ไม่แน่ใจ/;

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
    const language = input.language ?? 'th';
    const phrases = OFFICER_COPY[language];
    const question = (concept: string, fallback: string) =>
      questionFor(concept, language, fallback);
    const item = currentItem(input.plan);
    if (input.learnerMessage === null || !item) {
      const first = input.plan.items[0];
      return {
        say: phrases.greeting + (first ? question(first.concept, first.question) : ''),
        assessment: null,
        next: first ? { concept: first.concept } : { close: 'plan_complete' },
      };
    }
    const message = input.learnerMessage;
    let verdict: Assessment['verdict'];
    if (input.plan.version === 3) {
      const translatedExpected = readinessItem(item.concept)
        ?.facts.map((fact) => input.translatedFacts?.[fact])
        .filter((value): value is string => Boolean(value))
        .join(' / ');
      verdict = input.pastedDetected
        ? 'wrong'
        : evaluateReadinessAnswer(
            item,
            message,
            translatedExpected || undefined,
            input.facts.company_name_en,
          );
    } else if (input.pastedDetected) verdict = 'pasted';
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
    const assessment: Assessment = {
      concept: item.concept,
      verdict,
      note: verdict === 'correct' ? phrases.correct : phrases.wrong,
    };
    const evasions = input.evasions + (verdict === 'evasive' ? 1 : 0);
    if (!isReadinessPlan(input.plan) && evasions >= MAX_EVASIONS) {
      return {
        say: phrases.evasions,
        assessment,
        next: { close: 'too_many_evasions' },
      };
    }
    const stay = verdict !== 'correct' && item.attempts < 1;
    if (stay) {
      const ask = input.pastedDetected || verdict === 'pasted' ? phrases.pasted : phrases.reask;
      return {
        say: ask + question(item.concept, item.question),
        assessment,
        next: { concept: item.concept },
      };
    }
    const next = input.plan.items[input.plan.cursor + 1];
    if (!next) {
      return {
        say: phrases.complete,
        assessment,
        next: { close: 'plan_complete' },
      };
    }
    const lead = next.phase === 'probing' ? phrases.probing : phrases.next;
    return {
      say: lead + question(next.concept, next.question),
      assessment,
      next: { concept: next.concept },
    };
  }

  async narrate(input: NarrateInput): Promise<string> {
    const copy = OFFICER_COPY[input.language ?? 'th'];
    if (input.verdict.verdict === 'ready') return copy.ready;
    const weak = input.verdict.reasons
      .filter((reason) => reason.verdict !== 'correct')
      .map((reason) => questionFor(reason.concept, input.language ?? 'th', reason.concept));
    return weak.length ? `${copy.practise} (${weak.join('; ')})` : copy.practise;
  }
}
