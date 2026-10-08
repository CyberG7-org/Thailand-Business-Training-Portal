import { describe, expect, it } from 'vitest';
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { legacyMcqRule, mcqResult, mcqRule, readMcqRule } from '@/lib/domain/mcq/result';

const V2_RULE = mcqRule(27);
const V1_RULE = legacyMcqRule(27, 23);
const NON_CRITICAL = MCQ_CONCEPTS.filter((concept) => !concept.critical).map(
  (concept) => concept.key,
);

const answers = (wrong: readonly string[]) =>
  MCQ_CONCEPTS.map((concept) => ({
    conceptKey: concept.key,
    isCorrect: !wrong.includes(concept.key),
  }));

describe('the current Business Knowledge Quiz rule', () => {
  it('passes at 27 and has no critical-question override', () => {
    expect(V2_RULE).toEqual({ version: 2, passScore: 27 });
    expect(mcqResult(answers(NON_CRITICAL.slice(0, 3)), V2_RULE)).toEqual({
      result: 'pass',
      score: 27,
      criticalWrong: [],
    });
    expect(mcqResult(answers(['registered_capital']), V2_RULE)).toEqual({
      result: 'pass',
      score: 29,
      criticalWrong: [],
    });
  });

  it('keeps practising below 27 without a retest band', () => {
    expect(mcqResult(answers(NON_CRITICAL.slice(0, 4)), V2_RULE)).toEqual({
      result: 'fail',
      score: 26,
      criticalWrong: [],
    });
  });
});

describe('legacy quiz rule snapshots', () => {
  it('retain their frozen critical and retest behaviour', () => {
    expect(mcqResult(answers(['registered_capital']), V1_RULE)).toEqual({
      result: 'fail',
      score: 29,
      criticalWrong: ['registered_capital'],
    });
    expect(mcqResult(answers(NON_CRITICAL.slice(0, 4)), V1_RULE)).toMatchObject({
      result: 'retest',
      score: 26,
    });
  });

  it('reads both old unversioned snapshots and v2 snapshots', () => {
    const storedV1 = {
      passScore: V1_RULE.passScore,
      retestScore: V1_RULE.retestScore,
      criticalKeys: V1_RULE.criticalKeys,
    };
    expect(readMcqRule(JSON.parse(JSON.stringify(storedV1)))).toMatchObject({ version: 1 });
    expect(readMcqRule(JSON.parse(JSON.stringify(V2_RULE)))).toEqual(V2_RULE);
    expect(readMcqRule(null)).toBeNull();
    expect(readMcqRule({ passScore: 27 })).toBeNull();
  });
});
