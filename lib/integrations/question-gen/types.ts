import type { AppLocale } from '@/i18n/routing';

export type GeneratedOption = { key: 'A' | 'B' | 'C' | 'D'; text: string };

export type GeneratedLocalization = {
  prompt: string;
  options: GeneratedOption[];
  correct_key: 'A' | 'B' | 'C' | 'D';
  explanation: string;
};

/** One question in all three languages, as the model returns it. */
export type GeneratedQuestion = {
  kind: 'generic' | 'dbd_template';
  localizations: Record<AppLocale, GeneratedLocalization>;
};

export type MaterialBundle = {
  /** Plain text material (study cards, pasted notes, extracted DOCX/TXT). */
  text: string;
  /** An uploaded PDF handed to the model as a document. */
  pdf: Uint8Array | null;
};

export type GenerateInput = {
  material: MaterialBundle;
  count: number;
  templateCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Optional steer, e.g. "focus on bank KYC questions". */
  focus: string | null;
};

export type TranslateInput = {
  sourceLanguage: AppLocale;
  source: GeneratedLocalization;
  targetLanguages: AppLocale[];
};

export interface QuestionGenerator {
  readonly name: string;
  readonly model: string | null;
  generate(input: GenerateInput): Promise<GeneratedQuestion[]>;
  translate(input: TranslateInput): Promise<Partial<Record<AppLocale, GeneratedLocalization>>>;
}

export class QuestionGenError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_configured' | 'provider' | 'invalid_output' | 'no_material',
  ) {
    super(message);
    this.name = 'QuestionGenError';
  }
}
