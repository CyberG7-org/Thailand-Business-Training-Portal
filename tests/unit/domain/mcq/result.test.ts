import { describe, expect, it } from 'vitest';
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { mcqResult, mcqRule, readMcqRule } from '@/lib/domain/mcq/result';

const RULE = mcqRule(27, 23);
const NON_CRITICAL = MCQ_CONCEPTS.filter((c) => !c.critical).map((c) => c.key);

/** Thirty answers, wrong on the concepts named. */
const answers = (wrong: readonly string[]) =>
  MCQ_CONCEPTS.map((c) => ({ conceptKey: c.key, isCorrect: !wrong.includes(c.key) }));

describe('the result of the Business Knowledge Quiz (D71)', () => {
  it('is judged on exactly the nine critical concepts of D72', () => {
    expect(RULE.criticalKeys).toEqual([
      'company_name',
      'registration_number',
      'registration_date',
      'registered_location',
      'director_count',
      'director_identity',
      'signing_authority',
      'registered_capital',
      'actual_business',
    ]);
  });

  it('passes on 27 or more with no critical concept wrong', () => {
    expect(mcqResult(answers([]), RULE)).toEqual({ result: 'pass', score: 30, criticalWrong: [] });
    expect(mcqResult(answers(NON_CRITICAL.slice(0, 3)), RULE)).toMatchObject({
      result: 'pass',
      score: 27,
    });
  });

  it('asks for a retest from 23 to 26', () => {
    expect(mcqResult(answers(NON_CRITICAL.slice(0, 4)), RULE)).toMatchObject({
      result: 'retest',
      score: 26,
    });
    expect(mcqResult(answers(NON_CRITICAL.slice(0, 7)), RULE)).toMatchObject({
      result: 'retest',
      score: 23,
    });
  });

  it('fails below 23', () => {
    expect(mcqResult(answers(NON_CRITICAL.slice(0, 8)), RULE)).toMatchObject({
      result: 'fail',
      score: 22,
      criticalWrong: [],
    });
  });

  it('fails on one critical concept wrong, whatever the score, and names it', () => {
    expect(mcqResult(answers(['registered_capital']), RULE)).toEqual({
      result: 'fail',
      score: 29,
      criticalWrong: ['registered_capital'],
    });
  });

  it('never lets the retest mark sit above the pass mark', () => {
    expect(mcqRule(20, 25).retestScore).toBe(20);
  });

  it('reads the rule back from an attempt, and nothing from an earlier attempt', () => {
    expect(readMcqRule(JSON.parse(JSON.stringify(RULE)))).toEqual(RULE);
    expect(readMcqRule(null)).toBeNull();
    expect(readMcqRule({ passScore: 27 })).toBeNull();
  });
});
