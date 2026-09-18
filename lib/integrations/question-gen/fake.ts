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

type Tpl = Record<AppLocale, GeneratedLocalization>;
const opts = (a: string, b: string, c: string, d: string) => [
  { key: 'A' as const, text: a },
  { key: 'B' as const, text: b },
  { key: 'C' as const, text: c },
  { key: 'D' as const, text: d },
];

/** One personalised question per certificate particular; batches cycle through them. */
const DBD_TEMPLATES: ((n: number) => Tpl)[] = [
  (n) => ({
    th: {
      prompt: `(${n}) ทุนจดทะเบียนของบริษัท {company_name_th} คือเท่าใด`,
      options: opts(
        '{registered_capital} บาท',
        '{registered_capital|x2} บาท',
        '{registered_capital|x0.5} บาท',
        '{registered_capital|x10} บาท',
      ),
      correct_key: 'A',
      explanation: 'ดูข้อ 4 ทุนจดทะเบียน ในหนังสือรับรอง',
    },
    en: {
      prompt: `(${n}) What is the registered capital of {company_name_th}?`,
      options: opts(
        '{registered_capital} baht',
        '{registered_capital|x2} baht',
        '{registered_capital|x0.5} baht',
        '{registered_capital|x10} baht',
      ),
      correct_key: 'A',
      explanation: 'See item 4, registered capital, on the certificate.',
    },
    zh: {
      prompt: `(${n}) {company_name_th} 的注册资本是多少？`,
      options: opts(
        '{registered_capital} 泰铢',
        '{registered_capital|x2} 泰铢',
        '{registered_capital|x0.5} 泰铢',
        '{registered_capital|x10} 泰铢',
      ),
      correct_key: 'A',
      explanation: '参见公司注册证明第 4 项注册资本。',
    },
  }),
  (n) => ({
    th: {
      prompt: `(${n}) สำนักงานใหญ่ของบริษัท {company_name_th} ตั้งอยู่ที่ใด`,
      options: opts(
        '{head_office_address}',
        'เลขที่ 1 ถนนสีลม เขตบางรัก กรุงเทพมหานคร',
        'เลขที่ 99 หมู่ 9 อำเภอเมือง จังหวัดเชียงใหม่',
        'เลขที่ 45/6 ตำบลบางปู อำเภอเมือง จังหวัดสมุทรปราการ',
      ),
      correct_key: 'A',
      explanation: 'ดูข้อ 5 ที่ตั้งสำนักงานใหญ่ ในหนังสือรับรอง',
    },
    en: {
      prompt: `(${n}) Where is the head office of {company_name_th}?`,
      options: opts(
        '{head_office_address}',
        'No. 1 Silom Road, Bang Rak, Bangkok',
        'No. 99 Moo 9, Mueang District, Chiang Mai',
        'No. 45/6 Bang Pu, Mueang District, Samut Prakan',
      ),
      correct_key: 'A',
      explanation: 'See item 5, head office address, on the certificate.',
    },
    zh: {
      prompt: `(${n}) {company_name_th} 的总部位于哪里？`,
      options: opts(
        '{head_office_address}',
        '曼谷挽叻区是隆路 1 号',
        '清迈府直辖县第 9 村 99 号',
        '北榄府直辖县邦浦 45/6 号',
      ),
      correct_key: 'A',
      explanation: '参见公司注册证明第 5 项总部地址。',
    },
  }),
  (n) => ({
    th: {
      prompt: `(${n}) บริษัท {company_name_th} จดทะเบียนเป็นนิติบุคคลเมื่อใด`,
      options: opts('{registered_on}', '{registered_on|+1m}', '{registered_on|-1y}', '{issued_on}'),
      correct_key: 'A',
      explanation: 'วันที่จดทะเบียนอยู่ในส่วนหัวของหนังสือรับรอง',
    },
    en: {
      prompt: `(${n}) When was {company_name_th} registered as a juristic person?`,
      options: opts('{registered_on}', '{registered_on|+1m}', '{registered_on|-1y}', '{issued_on}'),
      correct_key: 'A',
      explanation: 'The registration date is in the certificate header.',
    },
    zh: {
      prompt: `(${n}) {company_name_th} 何时注册为法人？`,
      options: opts('{registered_on}', '{registered_on|+1m}', '{registered_on|-1y}', '{issued_on}'),
      correct_key: 'A',
      explanation: '注册日期位于证明的抬头部分。',
    },
  }),
  (n) => ({
    th: {
      prompt: `(${n}) เลขทะเบียนนิติบุคคลของบริษัท {company_name_th} คือหมายเลขใด`,
      options: opts('{juristic_id}', '{juristic_id|shuffle}', '0105530000001', '0115560000009'),
      correct_key: 'A',
      explanation: 'เลขทะเบียน 13 หลักอยู่ในส่วนหัวของหนังสือรับรอง',
    },
    en: {
      prompt: `(${n}) What is the juristic person registration number of {company_name_th}?`,
      options: opts('{juristic_id}', '{juristic_id|shuffle}', '0105530000001', '0115560000009'),
      correct_key: 'A',
      explanation: 'The 13-digit number is in the certificate header.',
    },
    zh: {
      prompt: `(${n}) {company_name_th} 的法人注册号是多少？`,
      options: opts('{juristic_id}', '{juristic_id|shuffle}', '0105530000001', '0115560000009'),
      correct_key: 'A',
      explanation: '13 位注册号位于证明的抬头部分。',
    },
  }),
  (n) => ({
    th: {
      prompt: `(${n}) ใครคือกรรมการของบริษัท {company_name_th}`,
      options: opts('{directors}', 'นายสมชาย ใจดี', 'นางสาวสมหญิง รักไทย', 'นายวิชัย มั่นคง'),
      correct_key: 'A',
      explanation: 'ดูข้อ 2 รายชื่อกรรมการ ในหนังสือรับรอง',
    },
    en: {
      prompt: `(${n}) Who is a director of {company_name_th}?`,
      options: opts(
        '{directors}',
        'Mr. Somchai Jaidee',
        'Miss Somying Rakthai',
        'Mr. Wichai Mankhong',
      ),
      correct_key: 'A',
      explanation: 'See item 2, directors, on the certificate.',
    },
    zh: {
      prompt: `(${n}) 谁是 {company_name_th} 的董事？`,
      options: opts(
        '{directors}',
        'Somchai Jaidee 先生',
        'Somying Rakthai 女士',
        'Wichai Mankhong 先生',
      ),
      correct_key: 'A',
      explanation: '参见公司注册证明第 2 项董事名单。',
    },
  }),
  (n) => ({
    th: {
      prompt: `(${n}) หนังสือรับรองของบริษัท {company_name_th} ออกให้เมื่อใด`,
      options: opts('{issued_on}', '{issued_on|-1m}', '{issued_on|+10d}', '{registered_on}'),
      correct_key: 'A',
      explanation: 'วันที่ออกหนังสือรับรองอยู่ท้ายเอกสารเหนือลายมือชื่อนายทะเบียน',
    },
    en: {
      prompt: `(${n}) When was the certificate of {company_name_th} issued?`,
      options: opts('{issued_on}', '{issued_on|-1m}', '{issued_on|+10d}', '{registered_on}'),
      correct_key: 'A',
      explanation: 'The issue date is at the end of the certificate above the Registrar signature.',
    },
    zh: {
      prompt: `(${n}) {company_name_th} 的注册证明是何时签发的？`,
      options: opts('{issued_on}', '{issued_on|-1m}', '{issued_on|+10d}', '{registered_on}'),
      correct_key: 'A',
      explanation: '签发日期位于证明末尾登记官签名上方。',
    },
  }),
];

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
          ? DBD_TEMPLATES[(n - 1) % DBD_TEMPLATES.length](n)
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
