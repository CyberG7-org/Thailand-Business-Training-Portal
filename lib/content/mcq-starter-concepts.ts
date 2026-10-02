import type { Recipe } from '@/lib/domain/mcq/tokens';
import type { StarterVariant, VariantText } from '@/lib/domain/mcq/variant';

/**
 * A starter question for every concept the first ten did not cover (D99), so the Business
 * Knowledge Quiz can ask all thirty. Loaded as drafts like the others: the Owner reads the Thai
 * and approves. A wrong option is either the company's own fact varied by a recipe, or an answer
 * a bank officer would stop at — never something that could be true of a real company.
 */
type Four = [string, string, string, string];
type Lang = [prompt: string, options: Four, explanation: string];

const text = ([prompt, options, explanation]: Lang): VariantText => ({
  prompt,
  options: { A: options[0], B: options[1], C: options[2], D: options[3] },
  explanation,
});

function starter(
  key: string,
  conceptKey: string,
  recipes: [Recipe, Recipe, Recipe, Recipe],
  th: Lang,
  en: Lang,
  zh: Lang,
): StarterVariant {
  return {
    key,
    conceptKey,
    correctKey: 'A',
    optionRecipes: { A: recipes[0], B: recipes[1], C: recipes[2], D: recipes[3] },
    appliesWhen: null,
    texts: { th: text(th), en: text(en), zh: text(zh) },
  };
}

const FACT_AND_STATIC: [Recipe, Recipe, Recipe, Recipe] = [
  'DIRECT_FACT',
  'STATIC',
  'STATIC',
  'STATIC',
];
const ALL_STATIC: [Recipe, Recipe, Recipe, Recipe] = ['STATIC', 'STATIC', 'STATIC', 'STATIC'];
const AMOUNTS: [Recipe, Recipe, Recipe, Recipe] = [
  'DIRECT_FACT',
  'NUMERIC_VARIATION',
  'NUMERIC_VARIATION',
  'NUMERIC_VARIATION',
];
const COUNTS: [Recipe, Recipe, Recipe, Recipe] = [
  'DIRECT_FACT',
  'COUNT_VARIATION',
  'COUNT_VARIATION',
  'COUNT_VARIATION',
];
const COMPOSITES: [Recipe, Recipe, Recipe, Recipe] = [
  'COMPOSITE_TEMPLATE',
  'COMPOSITE_TEMPLATE',
  'COMPOSITE_TEMPLATE',
  'COMPOSITE_TEMPLATE',
];

const HOLDERS: Four = [
  '{shareholder_count}',
  '{shareholder_count|count(-1)}',
  '{shareholder_count|count(+1)}',
  '{shareholder_count|count(+2)}',
];
const HOLDERS_UP: Four = [
  '{shareholder_count}',
  '{shareholder_count|count(+1)}',
  '{shareholder_count|count(+2)}',
  '{shareholder_count|count(+3)}',
];
const PRODUCTS: Four = [
  '{products_services}',
  '{business_category|business_alt}',
  '{business_category|business_alt}',
  '{business_category|business_alt}',
];
const REVENUE: Four = [
  '{monthly_revenue_amount}',
  '{monthly_revenue_amount|numeric(x3)}',
  '{monthly_revenue_amount|numeric(x0.5)}',
  '{monthly_revenue_amount|numeric(x10)}',
];
const AVERAGE: Four = [
  '{average_transaction_amount}',
  '{average_transaction_amount|numeric(x2)}',
  '{average_transaction_amount|numeric(x0.2)}',
  '{average_transaction_amount|numeric(x10)}',
];

export const MCQ_STARTER_CONCEPTS: readonly StarterVariant[] = [
  starter(
    'mcq-company-name-1',
    'company_name',
    ['DIRECT_FACT', 'COMPOSITE_TEMPLATE', 'COMPOSITE_TEMPLATE', 'COMPOSITE_TEMPLATE'],
    [
      'ชื่อบริษัทตามที่จดทะเบียนคือข้อใด',
      [
        '{company_name_th}',
        '{company_name_th} (มหาชน)',
        '{company_name_th} (ประเทศไทย)',
        '{company_name_th} โฮลดิ้ง',
      ],
      'ชื่อบริษัทตามหนังสือรับรองคือ {company_name_th} ต้องตอบให้ครบทุกคำ ไม่เพิ่มและไม่ตัดคำใด',
    ],
    [
      "Which is the company's registered name?",
      [
        '{company_name_th}',
        '{company_name_th} (Public)',
        '{company_name_th} (Thailand)',
        '{company_name_th} Holding',
      ],
      'The name on the certificate is {company_name_th}. Give it in full, with nothing added and nothing left out.',
    ],
    [
      '公司的注册名称是哪一个？',
      [
        '{company_name_th}',
        '{company_name_th}（大众）',
        '{company_name_th}（泰国）',
        '{company_name_th} 控股',
      ],
      '登记证明上的公司名称为 {company_name_th}。回答时须完整，不增不减。',
    ],
  ),
  starter(
    'mcq-director-identity-1',
    'director_identity',
    FACT_AND_STATIC,
    [
      'ตามหนังสือรับรอง กรรมการของบริษัทคือใคร',
      [
        '{directors}',
        'ผู้ถือหุ้นทุกคนของบริษัท',
        'นายทะเบียนผู้ลงนามในหนังสือรับรอง',
        'ยังไม่มีการแต่งตั้งกรรมการ',
      ],
      'กรรมการตามหนังสือรับรอง (ข้อ 2) คือ {directors}',
    ],
    [
      "According to the certificate, who is the company's director?",
      [
        '{directors}',
        'Every shareholder of the company',
        'The registrar who signed the certificate',
        'No director has been appointed yet',
      ],
      'The certificate (item 2) names the director: {directors}.',
    ],
    [
      '根据公司登记证明，公司的董事是谁？',
      ['{directors}', '公司的全体股东', '在登记证明上签字的登记官', '尚未任命董事'],
      '登记证明（第 2 项）列明的董事为：{directors}。',
    ],
  ),
  starter(
    'mcq-signing-authority-1',
    'signing_authority',
    FACT_AND_STATIC,
    [
      'ตามหนังสือรับรอง ใครมีอำนาจลงลายมือชื่อผูกพันบริษัท',
      [
        '{signing_authority}',
        'ผู้ถือหุ้นคนใดคนหนึ่งลงลายมือชื่อแทนบริษัท',
        'สำนักงานบัญชีที่บริษัทจ้างลงลายมือชื่อแทนกรรมการ',
        'พนักงานคนใดก็ได้ที่ถือตราประทับของบริษัท',
      ],
      'อำนาจกรรมการตามหนังสือรับรอง (ข้อ 3): {signing_authority}',
    ],
    [
      'According to the certificate, who can sign to bind the company?',
      [
        '{signing_authority}',
        'Any one shareholder signs for the company',
        'The accounting firm the company hires signs for the director',
        'Any employee who holds the company seal',
      ],
      'The signing authority on the certificate (item 3): {signing_authority}',
    ],
    [
      '根据公司登记证明，谁有权签字对公司产生约束力？',
      [
        '{signing_authority}',
        '任何一名股东代表公司签字',
        '公司聘请的会计事务所代董事签字',
        '任何持有公司印章的员工',
      ],
      '登记证明（第 3 项）载明的签字权：{signing_authority}',
    ],
  ),
  starter(
    'mcq-shareholder-count-1',
    'shareholder_count',
    COUNTS,
    [
      'ตามบัญชีรายชื่อผู้ถือหุ้น บริษัทมีผู้ถือหุ้นกี่คน',
      HOLDERS,
      'บัญชีรายชื่อผู้ถือหุ้น (บอจ.5) ระบุผู้ถือหุ้น {shareholder_count} คน ได้แก่ {shareholders}',
    ],
    [
      'According to the list of shareholders, how many shareholders does the company have?',
      HOLDERS,
      'The list of shareholders (BOJ.5) has {shareholder_count} names: {shareholders}.',
    ],
    [
      '根据股东名册，公司有几名股东？',
      HOLDERS,
      '股东名册（BOJ.5）列明 {shareholder_count} 名股东：{shareholders}。',
    ],
  ),
  // Asked when the first cannot be: a list with one name has no "one fewer" to offer.
  starter(
    'mcq-shareholder-count-2',
    'shareholder_count',
    COUNTS,
    [
      'บริษัทมีผู้ถือหุ้นทั้งหมดกี่คน',
      HOLDERS_UP,
      'บัญชีรายชื่อผู้ถือหุ้น (บอจ.5) ระบุผู้ถือหุ้น {shareholder_count} คน ได้แก่ {shareholders}',
    ],
    [
      'How many shareholders does the company have in all?',
      HOLDERS_UP,
      'The list of shareholders (BOJ.5) has {shareholder_count} names: {shareholders}.',
    ],
    [
      '公司一共有几名股东？',
      HOLDERS_UP,
      '股东名册（BOJ.5）列明 {shareholder_count} 名股东：{shareholders}。',
    ],
  ),
  starter(
    'mcq-products-services-1',
    'products_services',
    ['DIRECT_FACT', 'BUSINESS_ALTERNATIVE', 'BUSINESS_ALTERNATIVE', 'BUSINESS_ALTERNATIVE'],
    [
      'บริษัทขายสินค้าหรือให้บริการอะไร',
      PRODUCTS,
      'สินค้าหรือบริการของบริษัท: {products_services}',
    ],
    [
      'What does the company sell or provide?',
      PRODUCTS,
      "The company's products or services: {products_services}",
    ],
    ['公司销售什么产品或提供什么服务？', PRODUCTS, '公司的产品或服务：{products_services}'],
  ),
  starter(
    'mcq-business-purpose-1',
    'business_purpose',
    FACT_AND_STATIC,
    [
      'บริษัทจัดตั้งขึ้นเพื่ออะไร',
      [
        '{business_purpose}',
        'เพื่อถือครองทรัพย์สินแทนบุคคลอื่น',
        'เพื่อเปิดบัญชีธนาคารให้บุคคลอื่นใช้',
        'ยังไม่มีวัตถุประสงค์ที่ชัดเจน',
      ],
      'เหตุผลที่ตั้งบริษัท: {business_purpose}',
    ],
    [
      'Why was the company set up?',
      [
        '{business_purpose}',
        'To hold assets on behalf of someone else',
        'To open a bank account for other people to use',
        'There is no clear purpose yet',
      ],
      'Why the company was set up: {business_purpose}',
    ],
    [
      '公司为什么成立？',
      ['{business_purpose}', '为他人代持资产', '为了开立银行账户供他人使用', '尚无明确目的'],
      '公司成立的原因：{business_purpose}',
    ],
  ),
  starter(
    'mcq-client-origin-1',
    'client_origin',
    FACT_AND_STATIC,
    [
      'บริษัทหาลูกค้ามาจากช่องทางใด',
      [
        '{client_origin}',
        'ไม่ทราบว่าลูกค้ามาจากที่ใด',
        'บุคคลที่ไม่รู้จักโอนเงินเข้ามาเอง',
        'ยังไม่เคยคิดเรื่องการหาลูกค้า',
      ],
      'ที่มาของลูกค้าของบริษัท: {client_origin}',
    ],
    [
      'How does the company find its customers?',
      [
        '{client_origin}',
        'I do not know where the customers come from',
        'Strangers transfer money in on their own',
        'Finding customers has not been thought about yet',
      ],
      "Where the company's customers come from: {client_origin}",
    ],
    [
      '公司通过什么渠道获得客户？',
      ['{client_origin}', '不清楚客户从哪里来', '陌生人自行转账进来', '还没有考虑过如何找客户'],
      '公司的客户来源：{client_origin}',
    ],
  ),
  starter(
    'mcq-main-suppliers-1',
    'main_suppliers',
    FACT_AND_STATIC,
    [
      'บริษัทซื้อสินค้าหรือวัตถุดิบจากใคร',
      [
        '{main_suppliers}',
        'ไม่ทราบ มีคนอื่นจัดการให้ทั้งหมด',
        'ซื้อจากใครก็ได้ที่ราคาถูกที่สุดในวันนั้น ไม่มีรายประจำ',
        'รับสินค้าจากบุคคลที่ไม่รู้จัก โดยไม่มีเอกสาร',
      ],
      'ซัพพลายเออร์หลักของบริษัท: {main_suppliers}',
    ],
    [
      'Who does the company buy its goods or materials from?',
      [
        '{main_suppliers}',
        'I do not know; someone else handles all of it',
        'Whoever is cheapest that day; there is no regular supplier',
        'From people we do not know, with no paperwork',
      ],
      "The company's main suppliers: {main_suppliers}",
    ],
    [
      '公司从谁那里采购货物或原料？',
      [
        '{main_suppliers}',
        '不清楚，全部由别人处理',
        '当天谁最便宜就向谁买，没有固定供应商',
        '从不认识的人那里拿货，没有任何单据',
      ],
      '公司的主要供应商：{main_suppliers}',
    ],
  ),
  starter(
    'mcq-actual-business-location-1',
    'actual_business_location',
    ['DIRECT_FACT', 'COMPOSITE_TEMPLATE', 'COMPOSITE_TEMPLATE', 'STATIC'],
    [
      'บริษัทประกอบกิจการจริงที่ใด',
      [
        '{business_address}',
        'ที่สำนักงานอีกแห่งในพื้นที่ {district|geo_alt(province)} {province}',
        'ที่สำนักงานอีกแห่งในพื้นที่ {district|geo_alt(province)} {province}',
        'ไม่มีสถานที่ประกอบการ ใช้ที่อยู่ของสำนักงานบัญชี',
      ],
      'สถานที่ประกอบกิจการจริงของบริษัท: {business_address}',
    ],
    [
      'Where does the company actually operate?',
      [
        '{business_address}',
        'At another office in {district|geo_alt(province)}, {province}',
        'At another office in {district|geo_alt(province)}, {province}',
        "There is no place of business; it uses the accounting firm's address",
      ],
      "The company's actual place of business: {business_address}",
    ],
    [
      '公司实际在哪里经营？',
      [
        '{business_address}',
        '在 {district|geo_alt(province)}（{province}）的另一处办公室',
        '在 {district|geo_alt(province)}（{province}）的另一处办公室',
        '没有经营场所，使用会计事务所的地址',
      ],
      '公司的实际经营地点：{business_address}',
    ],
  ),
  // Asked when the first cannot be: an address whose district is not in the geography tables.
  starter(
    'mcq-actual-business-location-2',
    'actual_business_location',
    FACT_AND_STATIC,
    [
      'สถานที่ประกอบกิจการจริงของบริษัทคือที่ใด',
      [
        '{business_address}',
        'ไม่มีสถานที่ประกอบการ ใช้ที่อยู่ของสำนักงานบัญชี',
        'ที่บ้านของบุคคลอื่นที่ไม่เกี่ยวข้องกับบริษัท',
        'ยังไม่ทราบว่าจะประกอบกิจการที่ใด',
      ],
      'สถานที่ประกอบกิจการจริงของบริษัท: {business_address}',
    ],
    [
      "Which is the company's actual place of business?",
      [
        '{business_address}',
        "There is no place of business; it uses the accounting firm's address",
        'The home of someone who has nothing to do with the company',
        'It is not known yet where the company will operate',
      ],
      "The company's actual place of business: {business_address}",
    ],
    [
      '公司的实际经营地点是哪里？',
      [
        '{business_address}',
        '没有经营场所，使用会计事务所的地址',
        '与公司无关的他人住所',
        '还不知道将在哪里经营',
      ],
      '公司的实际经营地点：{business_address}',
    ],
  ),
  starter(
    'mcq-monthly-revenue-1',
    'monthly_revenue',
    AMOUNTS,
    [
      'บริษัทมีรายได้ประมาณเดือนละเท่าใด',
      REVENUE,
      'รายได้ต่อเดือนโดยประมาณของบริษัท: {monthly_revenue}',
    ],
    [
      'About how much does the company take in a month?',
      REVENUE,
      "The company's estimated monthly revenue: {monthly_revenue}",
    ],
    ['公司每月收入大约是多少？', REVENUE, '公司的预计月收入：{monthly_revenue}'],
  ),
  starter(
    'mcq-revenue-basis-1',
    'revenue_basis',
    FACT_AND_STATIC,
    [
      'ตัวเลขรายได้ต่อเดือนของบริษัทประมาณมาจากอะไร',
      [
        '{revenue_basis}',
        'เป็นตัวเลขที่สำนักงานบัญชีกำหนดให้',
        'ประมาณจากเงินกู้ที่คาดว่าจะได้รับ',
        'เป็นการคาดเดา ไม่มีที่มา',
      ],
      'ที่มาของการประมาณรายได้: {revenue_basis}',
    ],
    [
      "What is the company's monthly revenue figure based on?",
      [
        '{revenue_basis}',
        'It is a figure the accounting firm set',
        'It is estimated from a loan the company expects to receive',
        'It is a guess with nothing behind it',
      ],
      'What the revenue estimate is based on: {revenue_basis}',
    ],
    [
      '公司的月收入数字是根据什么估算的？',
      ['{revenue_basis}', '是会计事务所定的数字', '根据预计将获得的贷款估算', '只是猜测，没有依据'],
      '收入估算的依据：{revenue_basis}',
    ],
  ),
  starter(
    'mcq-average-transaction-1',
    'average_transaction',
    AMOUNTS,
    [
      'ยอดขายเฉลี่ยต่อรายการของบริษัทประมาณเท่าใด',
      AVERAGE,
      'ยอดธุรกรรมเฉลี่ยต่อครั้งของบริษัท: {average_transaction}',
    ],
    [
      "About how much is one of the company's sales, on average?",
      AVERAGE,
      "The company's average transaction amount: {average_transaction}",
    ],
    ['公司平均每笔销售金额大约是多少？', AVERAGE, '公司的平均每笔交易金额：{average_transaction}'],
  ),
  starter(
    'mcq-monthly-transactions-1',
    'monthly_transactions',
    COMPOSITES,
    [
      'บริษัทมีรายการขายประมาณเดือนละกี่รายการ',
      [
        '{monthly_transactions_count} รายการ',
        '{monthly_transactions_count|numeric(x2)} รายการ',
        '{monthly_transactions_count|numeric(x0.5)} รายการ',
        '{monthly_transactions_count|numeric(x10)} รายการ',
      ],
      'จำนวนธุรกรรมต่อเดือนของบริษัท: {monthly_transactions}',
    ],
    [
      'About how many sales does the company make in a month?',
      [
        '{monthly_transactions_count} sales',
        '{monthly_transactions_count|numeric(x2)} sales',
        '{monthly_transactions_count|numeric(x0.5)} sales',
        '{monthly_transactions_count|numeric(x10)} sales',
      ],
      "The company's transactions per month: {monthly_transactions}",
    ],
    [
      '公司每月大约有多少笔销售？',
      [
        '{monthly_transactions_count} 笔',
        '{monthly_transactions_count|numeric(x2)} 笔',
        '{monthly_transactions_count|numeric(x0.5)} 笔',
        '{monthly_transactions_count|numeric(x10)} 笔',
      ],
      '公司每月的交易笔数：{monthly_transactions}',
    ],
  ),
  // Asked when the first cannot be: one sale a month has no "half as many" to offer.
  starter(
    'mcq-monthly-transactions-2',
    'monthly_transactions',
    COMPOSITES,
    [
      'ในหนึ่งเดือน บริษัทมีรายการขายประมาณกี่รายการ',
      [
        '{monthly_transactions_count} รายการ',
        '{monthly_transactions_count|numeric(x2)} รายการ',
        '{monthly_transactions_count|numeric(x5)} รายการ',
        '{monthly_transactions_count|numeric(x10)} รายการ',
      ],
      'จำนวนธุรกรรมต่อเดือนของบริษัท: {monthly_transactions}',
    ],
    [
      'In one month, about how many sales does the company make?',
      [
        '{monthly_transactions_count} sales',
        '{monthly_transactions_count|numeric(x2)} sales',
        '{monthly_transactions_count|numeric(x5)} sales',
        '{monthly_transactions_count|numeric(x10)} sales',
      ],
      "The company's transactions per month: {monthly_transactions}",
    ],
    [
      '公司一个月大约有多少笔销售？',
      [
        '{monthly_transactions_count} 笔',
        '{monthly_transactions_count|numeric(x2)} 笔',
        '{monthly_transactions_count|numeric(x5)} 笔',
        '{monthly_transactions_count|numeric(x10)} 笔',
      ],
      '公司每月的交易笔数：{monthly_transactions}',
    ],
  ),
  starter(
    'mcq-startup-source-of-funds-1',
    'startup_source_of_funds',
    FACT_AND_STATIC,
    [
      'เงินทุนเริ่มต้นของบริษัทมาจากที่ใด',
      [
        '{source_of_funds}',
        'เงินกู้นอกระบบ',
        'เงินที่บุคคลอื่นนำมาให้เพื่อใช้เปิดบริษัท',
        'ไม่ทราบที่มาของเงินทุน',
      ],
      'ที่มาของเงินทุนเริ่มต้น: {source_of_funds}',
    ],
    [
      "Where did the company's start-up money come from?",
      [
        '{source_of_funds}',
        'An informal loan',
        'Money someone else put in so the company could be opened',
        'I do not know where the money came from',
      ],
      'The source of the start-up capital: {source_of_funds}',
    ],
    [
      '公司的启动资金来自哪里？',
      ['{source_of_funds}', '民间借贷', '他人为开办公司而提供的资金', '不清楚资金来源'],
      '启动资金的来源：{source_of_funds}',
    ],
  ),
  starter(
    'mcq-first-incoming-funds-1',
    'first_incoming_funds',
    FACT_AND_STATIC,
    [
      'เงินก้อนแรกที่จะเข้าบัญชีบริษัทคือเงินอะไร',
      [
        '{first_incoming_funds}',
        'เงินโอนจากบุคคลที่ไม่รู้จัก',
        'เงินมัดจำของลูกค้าที่ต้องโอนต่อให้ผู้อื่น',
        'ไม่ทราบว่าจะเป็นเงินอะไร',
      ],
      'เงินเข้าก้อนแรกของบัญชีบริษัท: {first_incoming_funds}',
    ],
    [
      "What will the first money into the company's account be?",
      [
        '{first_incoming_funds}',
        'A transfer from someone we do not know',
        "A customer's deposit to be passed on to someone else",
        'I do not know what it will be',
      ],
      "The first money into the company's account: {first_incoming_funds}",
    ],
    [
      '进入公司账户的第一笔资金是什么钱？',
      ['{first_incoming_funds}', '陌生人的转账', '需要转给他人的客户定金', '不清楚会是什么钱'],
      '公司账户的首笔入账资金：{first_incoming_funds}',
    ],
  ),
  starter(
    'mcq-bank-account-purpose-1',
    'bank_account_purpose',
    FACT_AND_STATIC,
    [
      'บริษัทต้องการเปิดบัญชีธนาคารเพื่ออะไร',
      [
        '{account_purpose}',
        'เพื่อรับโอนเงินแทนบุคคลอื่น',
        'เพราะมีคนขอให้เปิด',
        'เพื่อเก็บเงินออมส่วนตัว',
      ],
      'เหตุผลที่บริษัทต้องมีบัญชี: {account_purpose}',
    ],
    [
      'Why does the company need a bank account?',
      [
        '{account_purpose}',
        'To receive transfers on behalf of other people',
        'Because someone asked for it to be opened',
        'To keep personal savings',
      ],
      'Why the company needs the account: {account_purpose}',
    ],
    [
      '公司为什么需要开立银行账户？',
      ['{account_purpose}', '为了代他人收款', '因为有人要求开户', '为了存放个人储蓄'],
      '公司需要账户的原因：{account_purpose}',
    ],
  ),
  starter(
    'mcq-promptpay-qr-purpose-1',
    'promptpay_qr_purpose',
    FACT_AND_STATIC,
    [
      'เหตุใดบริษัทจึงต้องใช้ PromptPay / QR',
      [
        '{promptpay_qr_purpose}',
        'เพื่อให้บุคคลอื่นนำไปใช้รับเงิน',
        'ไม่จำเป็นต้องใช้ แต่ขอไว้ก่อน',
        'เพื่อหลีกเลี่ยงการมีหลักฐานการรับเงิน',
      ],
      'เหตุผลที่ต้องใช้ PromptPay / QR: {promptpay_qr_purpose}',
    ],
    [
      'Why does the company need PromptPay / QR?',
      [
        '{promptpay_qr_purpose}',
        'So that other people can use it to receive money',
        'It is not needed, but better to have it',
        'To avoid leaving a record of money received',
      ],
      'Why PromptPay / QR is needed: {promptpay_qr_purpose}',
    ],
    [
      '公司为什么需要 PromptPay / QR？',
      [
        '{promptpay_qr_purpose}',
        '为了让他人用来收款',
        '其实不需要，只是先申请',
        '为了避免留下收款记录',
      ],
      '需要 PromptPay / QR 的原因：{promptpay_qr_purpose}',
    ],
  ),
  starter(
    'mcq-otp-control-1',
    'otp_control',
    ALL_STATIC,
    [
      'ใครควรเป็นผู้ถือโทรศัพท์ที่รับรหัส OTP ของบัญชีบริษัท',
      [
        'กรรมการผู้มีอำนาจของบริษัทด้วยตนเอง',
        'สำนักงานบัญชีที่บริษัทจ้าง',
        'ผู้ที่ช่วยดำเนินการจดทะเบียนบริษัท',
        'ใครก็ได้ที่ขอรหัส',
      ],
      'รหัส OTP ใช้ยืนยันธุรกรรมของบัญชี กรรมการผู้มีอำนาจต้องถือโทรศัพท์และรับรหัสด้วยตนเอง ไม่ส่งต่อให้ผู้อื่น',
    ],
    [
      "Who should keep the phone that receives the OTP for the company's account?",
      [
        "The company's authorised director, personally",
        'The accounting firm the company hires',
        'Whoever helped register the company',
        'Anyone who asks for the code',
      ],
      'The OTP confirms transactions on the account. The authorised director keeps the phone and receives the code personally, and never passes it on.',
    ],
    [
      '接收公司账户 OTP 验证码的手机应由谁保管？',
      ['公司的授权董事本人', '公司聘请的会计事务所', '协助注册公司的人', '任何索要验证码的人'],
      'OTP 用于确认账户交易。授权董事须亲自保管手机并接收验证码，不得转交他人。',
    ],
  ),
  starter(
    'mcq-transaction-explanation-1',
    'transaction_explanation',
    ALL_STATIC,
    [
      'หากธนาคารสอบถามเกี่ยวกับรายการโอนเงินรายการหนึ่ง คุณควรทำอย่างไร',
      [
        'อธิบายที่มาของเงินและวัตถุประสงค์ทางธุรกิจของรายการนั้น',
        'แจ้งว่าเป็นความลับของบริษัท',
        'แจ้งว่าไม่ทราบ',
        'ให้บุคคลอื่นตอบแทน',
      ],
      'ธนาคารคาดหวังให้กรรมการอธิบายที่มาของเงินและวัตถุประสงค์ทางธุรกิจของธุรกรรมได้ด้วยตนเอง',
    ],
    [
      'The bank asks about one of the transfers. What should you do?',
      [
        'Explain where the money came from and the business purpose of the transfer',
        'Say it is a company secret',
        'Say you do not know',
        'Have someone else answer for you',
      ],
      'The bank expects the director to explain, personally, where the money came from and what the transaction was for.',
    ],
    [
      '如果银行询问某一笔转账，您应该怎么做？',
      ['说明该笔资金的来源及其商业目的', '表示这是公司机密', '表示不清楚', '让别人代为回答'],
      '银行要求董事能够亲自说明资金来源和交易的商业目的。',
    ],
  ),
  starter(
    'mcq-supporting-documents-1',
    'supporting_documents',
    ALL_STATIC,
    [
      'การรับหรือจ่ายเงินทางธุรกิจควรมีเอกสารใดประกอบ',
      [
        'ใบแจ้งหนี้ ใบเสร็จรับเงิน หรือสัญญา',
        'ไม่ต้องมีเอกสาร มีรายการโอนเงินก็เพียงพอ',
        'ข้อความสนทนาในแอปแชตเท่านั้น',
        'เอกสารที่จัดทำขึ้นภายหลังเมื่อธนาคารขอ',
      ],
      'ธุรกรรมทางธุรกิจต้องมีเอกสารประกอบ เช่น ใบแจ้งหนี้ ใบเสร็จรับเงิน หรือสัญญา ที่จัดทำขึ้นตามจริงในเวลาที่เกิดรายการ',
    ],
    [
      'What should a business payment, in or out, be supported by?',
      [
        'An invoice, a receipt or a contract',
        'Nothing; the transfer record is enough',
        'Only a message in a chat app',
        'Papers made afterwards, when the bank asks',
      ],
      'A business transaction is supported by a document such as an invoice, a receipt or a contract, made truthfully at the time of the transaction.',
    ],
    [
      '业务收付款应有什么文件作为凭证？',
      [
        '发票、收据或合同',
        '不需要文件，有转账记录就够了',
        '只有聊天软件里的消息',
        '银行要求时事后补做的文件',
      ],
      '业务交易须有凭证，例如在交易发生时如实开具的发票、收据或合同。',
    ],
  ),
  starter(
    'mcq-answer-consistency-1',
    'answer_consistency',
    ALL_STATIC,
    [
      'คำตอบที่คุณให้ธนาคารควรเป็นอย่างไร เมื่อเทียบกับเอกสารของบริษัท',
      [
        'ตรงกับเอกสารจดทะเบียนและธุรกิจที่ทำจริง',
        'ตอบตามที่ฟังดูดีที่สุด',
        'ตอบแตกต่างกันในแต่ละครั้งก็ได้',
        'ตอบตามที่เจ้าหน้าที่แนะนำ',
      ],
      'ทุกคำตอบต้องตรงกับเอกสารจดทะเบียนของบริษัทและธุรกิจที่ทำจริง และตอบเหมือนเดิมทุกครั้ง',
    ],
    [
      "How should the answers you give the bank compare with the company's documents?",
      [
        'The same as the registration documents and the real business',
        'Whatever sounds best',
        'They may differ from one time to the next',
        'Whatever the officer suggests',
      ],
      "Every answer matches the company's registration documents and its real business, and is the same every time.",
    ],
    [
      '您对银行的回答与公司文件相比应当如何？',
      ['与注册文件和实际业务一致', '怎么好听怎么答', '每次回答可以不一样', '按银行职员的建议回答'],
      '每个回答都必须与公司的注册文件和实际业务一致，并且每次回答都相同。',
    ],
  ),
];
