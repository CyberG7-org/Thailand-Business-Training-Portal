import type { AppLocale } from '@/i18n/routing';
import type {
  GenerateInput,
  GeneratedLocalization,
  GeneratedQuestion,
  QuestionGenerator,
  TranslateInput,
} from './types';

const GENERIC: Record<AppLocale, (n: number, topic: string) => GeneratedLocalization> = {
  th: (n, topic) => ({
    prompt: `(${n}) จากเนื้อหาเรื่อง "${topic}" หน่วยงานใดออกหนังสือรับรองนิติบุคคล`,
    options: [
      { key: 'A', text: 'กรมพัฒนาธุรกิจการค้า' },
      { key: 'B', text: 'กรมสรรพากร' },
      { key: 'C', text: 'ธนาคารแห่งประเทศไทย' },
      { key: 'D', text: 'สำนักงานประกันสังคม' },
    ],
    correct_key: 'A',
    explanation: 'หนังสือรับรองนิติบุคคลออกโดยกรมพัฒนาธุรกิจการค้า (DBD)',
  }),
  en: (n, topic) => ({
    prompt: `(${n}) According to "${topic}", which agency issues the company affidavit?`,
    options: [
      { key: 'A', text: 'Department of Business Development' },
      { key: 'B', text: 'Revenue Department' },
      { key: 'C', text: 'Bank of Thailand' },
      { key: 'D', text: 'Social Security Office' },
    ],
    correct_key: 'A',
    explanation: 'The company affidavit is issued by the Department of Business Development (DBD).',
  }),
  zh: (n, topic) => ({
    prompt: `(${n}) 根据《${topic}》，公司注册证明由哪个机构签发？`,
    options: [
      { key: 'A', text: '商业发展厅' },
      { key: 'B', text: '税务厅' },
      { key: 'C', text: '泰国银行' },
      { key: 'D', text: '社会保障办公室' },
    ],
    correct_key: 'A',
    explanation: '公司注册证明由商业发展厅（DBD）签发。',
  }),
};

const TEMPLATE: Record<AppLocale, (n: number) => GeneratedLocalization> = {
  th: (n) => ({
    prompt: `(${n}) ทุนจดทะเบียนของบริษัท {company_name_th} คือเท่าใด`,
    options: [
      { key: 'A', text: '{registered_capital} บาท' },
      { key: 'B', text: '{registered_capital|x2} บาท' },
      { key: 'C', text: '{registered_capital|x0.5} บาท' },
      { key: 'D', text: '{registered_capital|x10} บาท' },
    ],
    correct_key: 'A',
    explanation: 'ดูจากหนังสือรับรองของบริษัท',
  }),
  en: (n) => ({
    prompt: `(${n}) What is the registered capital of {company_name_th}?`,
    options: [
      { key: 'A', text: '{registered_capital} baht' },
      { key: 'B', text: '{registered_capital|x2} baht' },
      { key: 'C', text: '{registered_capital|x0.5} baht' },
      { key: 'D', text: '{registered_capital|x10} baht' },
    ],
    correct_key: 'A',
    explanation: 'See the company affidavit.',
  }),
  zh: (n) => ({
    prompt: `(${n}) {company_name_th} 的注册资本是多少？`,
    options: [
      { key: 'A', text: '{registered_capital} 泰铢' },
      { key: 'B', text: '{registered_capital|x2} 泰铢' },
      { key: 'C', text: '{registered_capital|x0.5} 泰铢' },
      { key: 'D', text: '{registered_capital|x10} 泰铢' },
    ],
    correct_key: 'A',
    explanation: '参见公司注册证明。',
  }),
};

/** Deterministic generator for dev and tests: template questions first, then generic ones. */
export class FakeQuestionGenerator implements QuestionGenerator {
  readonly name = 'fake';
  readonly model = null;

  async generate(input: GenerateInput): Promise<GeneratedQuestion[]> {
    const topic = input.material.text.trim().split('\n')[0]?.slice(0, 40) || 'material';
    const out: GeneratedQuestion[] = [];
    for (let n = 1; n <= input.count; n++) {
      const template = n <= input.templateCount;
      out.push({
        kind: template ? 'dbd_template' : 'generic',
        localizations: template
          ? { th: TEMPLATE.th(n), en: TEMPLATE.en(n), zh: TEMPLATE.zh(n) }
          : { th: GENERIC.th(n, topic), en: GENERIC.en(n, topic), zh: GENERIC.zh(n, topic) },
      });
    }
    return out;
  }

  async translate(
    input: TranslateInput,
  ): Promise<Partial<Record<AppLocale, GeneratedLocalization>>> {
    const out: Partial<Record<AppLocale, GeneratedLocalization>> = {};
    for (const lang of input.targetLanguages) {
      out[lang] = {
        prompt: `[${lang}] ${input.source.prompt}`,
        options: input.source.options.map((o) => ({ key: o.key, text: `[${lang}] ${o.text}` })),
        correct_key: input.source.correct_key,
        explanation: input.source.explanation ? `[${lang}] ${input.source.explanation}` : '',
      };
    }
    return out;
  }
}
