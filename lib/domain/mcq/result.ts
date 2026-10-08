import { CRITICAL_CONCEPT_KEYS } from '@/lib/domain/concepts/registry';

export type McqResult = 'pass' | 'retest' | 'fail';
export type McqRuleV1 = {
  version: 1;
  passScore: number;
  retestScore: number;
  criticalKeys: string[];
};
export type McqRuleV2 = { version: 2; passScore: number };
/** What an attempt is judged by, frozen when it starts. */
export type McqRule = McqRuleV1 | McqRuleV2;
export type McqAnswer = { conceptKey: string; isCorrect: boolean };

/** The current rule: one transparent score threshold and no mandatory questions. */
export function mcqRule(passScore: number): McqRuleV2 {
  return { version: 2, passScore };
}

/** Builds a legacy rule for compatibility tests and historic imports. */
export function legacyMcqRule(passScore: number, retestScore: number): McqRuleV1 {
  return {
    version: 1,
    passScore,
    retestScore: Math.min(retestScore, passScore),
    criticalKeys: [...CRITICAL_CONCEPT_KEYS],
  };
}

/** Reads current snapshots plus the unversioned v1 shape already stored in production. */
export function readMcqRule(value: unknown): McqRule | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version === 2) {
    return typeof candidate.passScore === 'number'
      ? { version: 2, passScore: candidate.passScore }
      : null;
  }
  if (
    (candidate.version === undefined || candidate.version === 1) &&
    typeof candidate.passScore === 'number' &&
    typeof candidate.retestScore === 'number' &&
    Array.isArray(candidate.criticalKeys)
  ) {
    return {
      version: 1,
      passScore: candidate.passScore,
      retestScore: candidate.retestScore,
      criticalKeys: candidate.criticalKeys.filter((key): key is string => typeof key === 'string'),
    };
  }
  return null;
}

/** V2 uses only the score. V1 retains its frozen critical and retest behaviour. */
export function mcqResult(
  answers: readonly McqAnswer[],
  rule: McqRule,
): { result: McqResult; score: number; criticalWrong: string[] } {
  const score = answers.filter((answer) => answer.isCorrect).length;
  if (rule.version === 2) {
    return { result: score >= rule.passScore ? 'pass' : 'fail', score, criticalWrong: [] };
  }

  const criticalWrong = answers
    .filter((answer) => !answer.isCorrect && rule.criticalKeys.includes(answer.conceptKey))
    .map((answer) => answer.conceptKey);
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
