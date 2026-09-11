import type { Locale } from '../thai-date';
import { createRng, shuffleWith } from './random';
import {
  MissingFieldError,
  renderTemplate,
  type TemplateField,
  type TemplateRecord,
} from './template';

export type OptionKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type QuestionOption = { key: OptionKey; text: string };

export type SelectableQuestion = {
  id: string;
  kind: 'generic' | 'dbd_template';
  approval_status: 'draft' | 'approved' | 'retired';
  active: boolean;
  pools: string[];
  dbd_field_dependencies: TemplateField[];
};

export type QuestionText = {
  prompt: string;
  options: QuestionOption[];
  correct_key: OptionKey;
  explanation: string | null;
};

export type RenderedQuestion = {
  questionId: string;
  prompt: string;
  /** Options in presentation order. */
  options: QuestionOption[];
  presentedOrder: OptionKey[];
  correctKey: OptionKey;
  explanation: string | null;
};

function hasValue(record: TemplateRecord, field: TemplateField): boolean {
  const v = record[field];
  return !(v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0));
}

/** D19: approved, active, in pool, and every referenced record field present. */
export function isSelectable(
  q: SelectableQuestion,
  pool: 'quiz' | 'exam',
  record: TemplateRecord | null,
): boolean {
  if (q.approval_status !== 'approved' || !q.active || !q.pools.includes(pool)) return false;
  if (q.dbd_field_dependencies.length === 0) return true;
  if (!record) return false;
  return q.dbd_field_dependencies.every((f) => hasValue(record, f));
}

export function selectQuestions<T extends SelectableQuestion>(args: {
  pool: 'quiz' | 'exam';
  count: number;
  seed: string;
  questions: T[];
  record: TemplateRecord | null;
}): T[] {
  const eligible = args.questions.filter((q) => isSelectable(q, args.pool, args.record));
  return shuffleWith(eligible, createRng(`${args.seed}:select`)).slice(0, args.count);
}

/** Deterministic option order per attempt seed + question. */
export function shuffleOptions(
  options: QuestionOption[],
  seed: string,
  questionId: string,
): QuestionOption[] {
  return shuffleWith(options, createRng(`${seed}:${questionId}`));
}

/** Renders prompt and options against the record and shuffles them. */
export function renderQuestion(
  questionId: string,
  text: QuestionText,
  record: TemplateRecord | null,
  seed: string,
  locale: Locale,
): RenderedQuestion {
  const emptyRecord: TemplateRecord = {
    company_name_th: null,
    company_name_en: null,
    juristic_id: null,
    certificate_no: null,
    registered_capital: null,
    head_office_address: null,
    registered_on: null,
    issued_on: null,
    directors: null,
    objectives_count: null,
    signing_authority: null,
  };
  const rec = record ?? emptyRecord;
  const render = (s: string) => renderTemplate(s, rec, `${seed}:${questionId}`, locale);
  const options = shuffleOptions(
    text.options.map((o) => ({ key: o.key, text: render(o.text) })),
    seed,
    questionId,
  );
  return {
    questionId,
    prompt: render(text.prompt),
    options,
    presentedOrder: options.map((o) => o.key),
    correctKey: text.correct_key,
    explanation: text.explanation,
  };
}

export { MissingFieldError };

export type AnswerLike = { is_correct: boolean | null };

export function scoreAnswers(answers: AnswerLike[]): { score: number; maxScore: number } {
  return {
    score: answers.filter((a) => a.is_correct === true).length,
    maxScore: answers.length,
  };
}

export function evaluateResult(
  score: number,
  maxScore: number,
  passingMarkPercent: number,
): 'pass' | 'fail' {
  if (maxScore === 0) return 'fail';
  return (score / maxScore) * 100 >= passingMarkPercent ? 'pass' : 'fail';
}
