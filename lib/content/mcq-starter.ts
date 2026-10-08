import type { Recipe } from '@/lib/domain/mcq/tokens';
import type { StarterVariant, VariantText } from '@/lib/domain/mcq/variant';
import { MCQ_STARTER_CONCEPTS } from './mcq-starter-concepts.ts';
import { TRAINING_SYLLABUS } from './training-syllabus.ts';

/**
 * Ten worked examples for the Owner's bank (P17d plan decision 12; D91 removed the one worded
 * for a company with no customers yet, a status that is now always yes): one for every recipe of
 * D77, loaded as drafts and never approved by code. They show the grammar at work; the wording
 * is the Owner's to change, approve or retire. The other concepts' starters are in
 * `mcq-starter-concepts.ts` (D100); `MCQ_STARTER` below is both together.
 */
const text = (
  prompt: string,
  options: [string, string, string, string],
  explanation: string,
): VariantText => ({
  prompt,
  options: { A: options[0], B: options[1], C: options[2], D: options[3] },
  explanation,
});
const recipes = (a: Recipe, b: Recipe, c: Recipe, d: Recipe) => ({ A: a, B: b, C: c, D: d });

const CAPITAL: [string, string, string, string] = [
  '{registered_capital}',
  '{registered_capital|numeric(x0.5)}',
  '{registered_capital|numeric(x2)}',
  '{registered_capital|numeric(x10)}',
];
const DIRECTORS: [string, string, string, string] = [
  '{director_count}',
  '{director_count|count(+1)}',
  '{director_count|count(+2)}',
  '{director_count|count(+3)}',
];
const DATES: [string, string, string, string] = [
  '{registered_on}',
  '{registered_on|date(-1y)}',
  '{registered_on|date(+1m)}',
  '{registered_on|date(-10d)}',
];
const IDS: [string, string, string, string] = [
  '{juristic_id}',
  '{juristic_id|id_mutation}',
  '{juristic_id|id_mutation}',
  '{juristic_id|id_mutation}',
];
const PROVINCES: [string, string, string, string] = [
  '{province}',
  '{province|geo_alt(region)}',
  '{province|geo_alt(region)}',
  '{province|geo_alt(region)}',
];
const BUSINESS: [string, string, string, string] = [
  '{nature_of_business}',
  '{business_category|business_alt}',
  '{business_category|business_alt}',
  '{business_category|business_alt}',
];

const WORKED_EXAMPLES: readonly StarterVariant[] = [
  {
    key: 'mcq-registered-capital-1',
    conceptKey: 'registered_capital',
    correctKey: 'A',
    optionRecipes: recipes(
      'DIRECT_FACT',
      'NUMERIC_VARIATION',
      'NUMERIC_VARIATION',
      'NUMERIC_VARIATION',
    ),
    appliesWhen: null,
    texts: {
      th: text(
        'ทุนจดทะเบียนของ {company_name_th} คือเท่าใด',
        CAPITAL,
        'ทุนจดทะเบียนตามหนังสือรับรองคือ {registered_capital}',
      ),
      en: text(
        'What is the registered capital of {company_name_th}?',
        CAPITAL,
        'The registered capital on the certificate is {registered_capital}.',
      ),
      zh: text(
        '{company_name_th} 的注册资本是多少？',
        CAPITAL,
        '公司登记证明上的注册资本为 {registered_capital}。',
      ),
    },
  },
  {
    key: 'mcq-director-count-1',
    conceptKey: 'director_count',
    correctKey: 'A',
    optionRecipes: recipes('DIRECT_FACT', 'COUNT_VARIATION', 'COUNT_VARIATION', 'COUNT_VARIATION'),
    appliesWhen: null,
    texts: {
      th: text(
        'ตามหนังสือรับรอง บริษัทมีกรรมการกี่คน',
        DIRECTORS,
        'หนังสือรับรองระบุกรรมการ {director_count} คน ได้แก่ {directors}',
      ),
      en: text(
        'According to the certificate, how many directors does the company have?',
        DIRECTORS,
        'The certificate lists {director_count} director(s): {directors}.',
      ),
      zh: text(
        '根据公司登记证明，公司有几名董事？',
        DIRECTORS,
        '登记证明列明 {director_count} 名董事：{directors}。',
      ),
    },
  },
  {
    key: 'mcq-registration-date-1',
    conceptKey: 'registration_date',
    correctKey: 'A',
    optionRecipes: recipes('DIRECT_FACT', 'DATE_VARIATION', 'DATE_VARIATION', 'DATE_VARIATION'),
    appliesWhen: null,
    texts: {
      th: text(
        'บริษัทจดทะเบียนจัดตั้งเมื่อวันที่เท่าใด',
        DATES,
        'วันจดทะเบียนตามหนังสือรับรองคือ {registered_on}',
      ),
      en: text(
        'On what date was the company registered?',
        DATES,
        'The registration date on the certificate is {registered_on}.',
      ),
      zh: text('公司是哪一天注册成立的？', DATES, '登记证明上的注册日期为 {registered_on}。'),
    },
  },
  {
    key: 'mcq-registration-number-1',
    conceptKey: 'registration_number',
    correctKey: 'A',
    optionRecipes: recipes('DIRECT_FACT', 'ID_MUTATION', 'ID_MUTATION', 'ID_MUTATION'),
    appliesWhen: null,
    texts: {
      th: text(
        'เลขทะเบียนนิติบุคคลของบริษัทคือข้อใด',
        IDS,
        'เลขทะเบียนนิติบุคคลมี 13 หลัก: {juristic_id}',
      ),
      en: text(
        "Which is the company's juristic registration number?",
        IDS,
        'The registration number has 13 digits: {juristic_id}.',
      ),
      zh: text('以下哪一个是公司的法人注册号？', IDS, '法人注册号共 13 位：{juristic_id}。'),
    },
  },
  {
    key: 'mcq-registered-location-1',
    conceptKey: 'registered_location',
    correctKey: 'A',
    optionRecipes: recipes(
      'DIRECT_FACT',
      'GEOGRAPHY_ALTERNATIVE',
      'GEOGRAPHY_ALTERNATIVE',
      'GEOGRAPHY_ALTERNATIVE',
    ),
    appliesWhen: null,
    texts: {
      th: text(
        'สำนักงานแห่งใหญ่ของบริษัทตั้งอยู่ในจังหวัดใด',
        PROVINCES,
        'ที่ตั้งสำนักงานแห่งใหญ่ตามหนังสือรับรอง: {address}',
      ),
      en: text(
        "In which province is the company's head office?",
        PROVINCES,
        'The head office address on the certificate: {address}',
      ),
      zh: text('公司总部位于哪个府？', PROVINCES, '登记证明上的总部地址：{address}'),
    },
  },
  {
    key: 'mcq-actual-business-1',
    conceptKey: 'actual_business',
    correctKey: 'A',
    optionRecipes: recipes(
      'DIRECT_FACT',
      'BUSINESS_ALTERNATIVE',
      'BUSINESS_ALTERNATIVE',
      'BUSINESS_ALTERNATIVE',
    ),
    appliesWhen: null,
    texts: {
      th: text(
        'ธุรกิจหลักที่บริษัทประกอบจริงคืออะไร',
        BUSINESS,
        'ธุรกิจหลักของบริษัท: {nature_of_business}',
      ),
      en: text(
        "What is the company's actual main business?",
        BUSINESS,
        "The company's main business: {nature_of_business}",
      ),
      zh: text('公司实际经营的主要业务是什么？', BUSINESS, '公司的主要业务：{nature_of_business}'),
    },
  },
  {
    key: 'mcq-internet-banking-control-1',
    conceptKey: 'internet_banking_control',
    correctKey: 'A',
    optionRecipes: recipes('STATIC', 'STATIC', 'STATIC', 'STATIC'),
    appliesWhen: null,
    texts: {
      th: text(
        'ใครควรเป็นผู้ถือและควบคุมการใช้งานอินเทอร์เน็ตแบงก์กิ้งของบัญชีบริษัท',
        [
          'กรรมการผู้มีอำนาจของบริษัทเท่านั้น',
          'สำนักงานบัญชีที่บริษัทจ้าง',
          'ตัวแทนที่ช่วยดำเนินการเปิดบัญชี',
          'พนักงานคนใดก็ได้ที่ทราบรหัสผ่าน',
        ],
        'ธนาคารคาดหวังให้กรรมการผู้มีอำนาจควบคุมบัญชีด้วยตนเอง ไม่มอบให้ผู้อื่น',
      ),
      en: text(
        'Who should hold and control internet banking for the company account?',
        [
          "Only the company's authorised director",
          'The accounting firm the company hires',
          'The agent who helped open the account',
          'Any employee who knows the password',
        ],
        'The bank expects the authorised director to control the account personally, never to hand it to someone else.',
      ),
      zh: text(
        '公司账户的网上银行应由谁持有并控制？',
        ['仅限公司的授权董事', '公司聘请的会计事务所', '协助开户的代理人', '任何知道密码的员工'],
        '银行要求授权董事亲自掌控账户，不得交给他人。',
      ),
    },
  },
  {
    key: 'mcq-learner-shareholding-1',
    conceptKey: 'learner_shareholding',
    correctKey: 'A',
    optionRecipes: recipes(
      'COMPOSITE_TEMPLATE',
      'COMPOSITE_TEMPLATE',
      'COMPOSITE_TEMPLATE',
      'STATIC',
    ),
    appliesWhen: { fact: 'learner_is_shareholder', value: true },
    texts: {
      th: text(
        'คุณถือหุ้นในบริษัทจำนวนเท่าใด',
        [
          '{my_shares} หุ้น ({my_share_percent})',
          '{my_shares|numeric(x0.5)} หุ้น ({my_share_percent|numeric(x0.5)})',
          '{my_shares|numeric(x2)} หุ้น',
          'ไม่ได้ถือหุ้น',
        ],
        'ตามบัญชีรายชื่อผู้ถือหุ้น คุณถือ {my_shares} หุ้น คิดเป็น {my_share_percent}',
      ),
      en: text(
        'How many shares do you hold in the company?',
        [
          '{my_shares} shares ({my_share_percent})',
          '{my_shares|numeric(x0.5)} shares ({my_share_percent|numeric(x0.5)})',
          '{my_shares|numeric(x2)} shares',
          'I hold no shares',
        ],
        'According to the list of shareholders you hold {my_shares} shares, which is {my_share_percent}.',
      ),
      zh: text(
        '您在公司持有多少股份？',
        [
          '{my_shares} 股（{my_share_percent}）',
          '{my_shares|numeric(x0.5)} 股（{my_share_percent|numeric(x0.5)}）',
          '{my_shares|numeric(x2)} 股',
          '未持有股份',
        ],
        '根据股东名册，您持有 {my_shares} 股，占 {my_share_percent}。',
      ),
    },
  },
  {
    key: 'mcq-learner-shareholding-2',
    conceptKey: 'learner_shareholding',
    correctKey: 'A',
    optionRecipes: recipes('STATIC', 'COMPOSITE_TEMPLATE', 'STATIC', 'STATIC'),
    appliesWhen: { fact: 'learner_is_shareholder', value: false },
    texts: {
      th: text(
        'คุณถือหุ้นในบริษัทหรือไม่',
        [
          'ไม่ได้ถือหุ้น',
          'ถือหุ้นทั้งหมด {total_shares} หุ้น',
          'ถือหุ้นร้อยละ 50',
          'ถือหุ้นร้อยละ 25',
        ],
        'ชื่อของคุณไม่อยู่ในบัญชีรายชื่อผู้ถือหุ้นของบริษัท',
      ),
      en: text(
        'Do you hold shares in the company?',
        ['I hold no shares', 'I hold all {total_shares} shares', 'I hold 50%', 'I hold 25%'],
        "Your name is not on the company's list of shareholders.",
      ),
      zh: text(
        '您是否持有公司股份？',
        ['未持有股份', '持有全部 {total_shares} 股', '持有 50%', '持有 25%'],
        '您的姓名不在公司的股东名册上。',
      ),
    },
  },
  {
    key: 'mcq-main-clients-1',
    conceptKey: 'main_clients',
    correctKey: 'A',
    optionRecipes: recipes('DIRECT_FACT', 'STATIC', 'STATIC', 'STATIC'),
    appliesWhen: null,
    texts: {
      th: text(
        'ลูกค้าหลักของบริษัทคือใคร',
        [
          '{main_clients}',
          'หน่วยงานราชการเท่านั้น',
          'ลูกค้าต่างประเทศทั้งหมด',
          'ยังไม่มีลูกค้าและยังไม่ทราบว่าจะขายให้ใคร',
        ],
        'ลูกค้าหลักตามข้อมูลบริษัท: {main_clients}',
      ),
      en: text(
        "Who are the company's main clients?",
        [
          '{main_clients}',
          'Government agencies only',
          'Overseas customers only',
          'No customers yet and no idea who to sell to',
        ],
        "The company's main clients: {main_clients}",
      ),
      zh: text(
        '公司的主要客户是谁？',
        ['{main_clients}', '仅政府机构', '全部为海外客户', '尚无客户，也不清楚卖给谁'],
        '公司的主要客户：{main_clients}',
      ),
    },
  },
];

/** Every starter draft: at least one question for each of the 30 MCQ concepts. */
/** The original bank remains exported for audit and for reading historic attempts. */
export const LEGACY_MCQ_STARTER: readonly StarterVariant[] = [
  ...WORKED_EXAMPLES,
  ...MCQ_STARTER_CONCEPTS,
];

const SHAREHOLDING_BASE: StarterVariant = {
  key: 'mcq-v2-learner-shareholding-base',
  conceptKey: 'learner_shareholding',
  correctKey: 'A',
  optionRecipes: recipes('COMPOSITE_TEMPLATE', 'STATIC', 'STATIC', 'STATIC'),
  appliesWhen: null,
  texts: {
    th: text(
      'คุณถือหุ้นกี่หุ้น',
      [
        '{my_shares} หุ้น ({my_share_percent})',
        'ไม่จำเป็นต้องรู้จำนวนหุ้นของตนเอง',
        'จำนวนหุ้นเท่ากับทุนจดทะเบียนเสมอ',
        'ธนาคารเป็นผู้กำหนดจำนวนหุ้นให้',
      ],
      'ตรวจจากบัญชีรายชื่อผู้ถือหุ้น: คุณถือ {my_shares} หุ้น คิดเป็น {my_share_percent}',
    ),
    en: text(
      'How many shares do you own?',
      [
        '{my_shares} shares ({my_share_percent})',
        'I do not need to know my shareholding',
        'My shares always equal the registered capital',
        'The bank decides how many shares I own',
      ],
      'Check the shareholder list: you own {my_shares} shares, which is {my_share_percent}.',
    ),
    zh: text(
      '您持有多少股份？',
      [
        '{my_shares} 股（{my_share_percent}）',
        '我不需要知道自己的持股',
        '我的股份始终等于注册资本',
        '银行决定我持有多少股份',
      ],
      '请查看股东名册：您持有 {my_shares} 股，占 {my_share_percent}。',
    ),
  },
};

/**
 * The approved v2 bank: exactly three plain-language variants for every concept. The final
 * legacy variant is used as the option base because it contains the robust one-share/one-sale
 * alternatives added after the original bank was exercised with edge-case companies.
 */
export const MCQ_STARTER: readonly StarterVariant[] = TRAINING_SYLLABUS.flatMap((syllabus) => {
  const candidates = LEGACY_MCQ_STARTER.filter(
    (variant) => variant.conceptKey === syllabus.conceptKey,
  );
  const base =
    syllabus.conceptKey === 'learner_shareholding' ? SHAREHOLDING_BASE : candidates.at(-1);
  if (!base) throw new Error(`Missing MCQ option base for ${syllabus.conceptKey}`);

  return ([0, 1, 2] as const).map((index): StarterVariant => ({
    ...base,
    key: `mcq-v2-${syllabus.conceptKey.replaceAll('_', '-')}-${index + 1}`,
    appliesWhen: null,
    optionRecipes: { ...base.optionRecipes },
    texts: Object.fromEntries(
      (['th', 'en', 'zh'] as const).map((locale) => {
        const source = base.texts[locale]!;
        return [
          locale,
          {
            ...source,
            prompt: syllabus.quizPrompts[locale][index],
            options: { ...source.options },
          },
        ];
      }),
    ),
  }));
});
