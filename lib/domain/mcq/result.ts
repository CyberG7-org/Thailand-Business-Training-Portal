import { CRITICAL_CONCEPT_KEYS } from '@/lib/domain/concepts/registry';

export type McqResult = 'pass' | 'retest' | 'fail';
/** What an attempt is judged by, frozen on it when it starts (D71). */
export type McqRule = { passScore: number; retestScore: number; criticalKeys: string[] };
export type McqAnswer = { conceptKey: string; isCorrect: boolean };

/** The rule as the settings stand now; a retest mark above the pass mark is read as the pass mark. */
export function mcqRule(passScore: number, retestScore: number): McqRule {
  return {
    passScore,
    retestScore: Math.min(retestScore, passScore),
    criticalKeys: [...CRITICAL_CONCEPT_KEYS],
  };
}

/** The rule stored on an attempt, or null when the attempt is from before the rule (P17e). */
export function readMcqRule(value: unknown): McqRule | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<McqRule>;
  if (typeof v.passScore !== 'number' || typeof v.retestScore !== 'number') return null;
  if (!Array.isArray(v.criticalKeys)) return null;
  return {
    passScore: v.passScore,
    retestScore: v.retestScore,
    criticalKeys: v.criticalKeys.filter((k): k is string => typeof k === 'string'),
  };
}

/** Any critical concept wrong → fail; else the score against the two thresholds (D71). */
export function mcqResult(
  answers: readonly McqAnswer[],
  rule: McqRule,
): { result: McqResult; score: number; criticalWrong: string[] } {
  const score = answers.filter((a) => a.isCorrect).length;
  const criticalWrong = answers
    .filter((a) => !a.isCorrect && rule.criticalKeys.includes(a.conceptKey))
    .map((a) => a.conceptKey);
  const result: McqResult =
    criticalWrong.length > 0
      ? 'fail'
      : score >= rule.passScore
        ? 'pass'
        : score >= rule.retestScore
          ? 'retest'
          : 'fail';
  return { result, score, criticalWrong };
}
