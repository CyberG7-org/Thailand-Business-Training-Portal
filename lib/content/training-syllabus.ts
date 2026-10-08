import type { AppLocale } from '@/i18n/routing';

type ThreePrompts = readonly [string, string, string];

export type TrainingSyllabusItem = {
  conceptKey: string;
  card: 1 | 2 | 3 | 4 | 5;
  quizPrompts: Record<AppLocale, ThreePrompts>;
};

const item = (
  conceptKey: string,
  card: TrainingSyllabusItem['card'],
  en: ThreePrompts,
  th: ThreePrompts,
  zh: ThreePrompts,
): TrainingSyllabusItem => ({ conceptKey, card, quizPrompts: { en, th, zh } });

/**
 * The learner's single syllabus: every quiz concept belongs to one cheat sheet and has three
 * deliberately simple phrasings. Study, quiz seeding and readiness copy build from this map.
 */
export const TRAINING_SYLLABUS: readonly TrainingSyllabusItem[] = [
  item(
    'company_name',
    1,
    [
      "What is the company's full registered name?",
      'Which name is registered for the company?',
      'Which company name appears on the DBD certificate?',
    ],
    [
      'ชื่อบริษัทเต็มตามที่จดทะเบียนคืออะไร',
      'บริษัทจดทะเบียนด้วยชื่อใด',
      'ชื่อบริษัทใดปรากฏในหนังสือรับรอง DBD',
    ],
    ['公司的完整注册名称是什么？', '公司以什么名称注册？', 'DBD 注册证明上显示哪个公司名称？'],
  ),
  item(
    'registration_number',
    1,
    [
      'What is the company registration number?',
      'Which 13-digit number belongs to the company?',
      'Which registration number appears on the DBD certificate?',
    ],
    [
      'เลขทะเบียนนิติบุคคลของบริษัทคืออะไร',
      'เลข 13 หลักใดเป็นของบริษัท',
      'เลขทะเบียนใดปรากฏในหนังสือรับรอง DBD',
    ],
    ['公司的注册号是什么？', '哪个 13 位号码属于公司？', 'DBD 注册证明上显示哪个注册号？'],
  ),
  item(
    'registration_date',
    1,
    [
      'When was the company registered?',
      "What is the company's registration date?",
      'Which date appears on the company certificate?',
    ],
    [
      'บริษัทจดทะเบียนเมื่อใด',
      'วันที่จดทะเบียนบริษัทคือวันใด',
      'วันที่ใดปรากฏในหนังสือรับรองบริษัท',
    ],
    ['公司什么时候注册？', '公司的注册日期是什么？', '公司注册证明上显示哪个日期？'],
  ),
  item(
    'registered_location',
    1,
    [
      'In which province is the company registered?',
      'What is the province of the registered office?',
      'Which province appears in the registered address?',
    ],
    [
      'บริษัทจดทะเบียนอยู่ในจังหวัดใด',
      'สำนักงานจดทะเบียนอยู่จังหวัดอะไร',
      'ที่อยู่จดทะเบียนระบุจังหวัดใด',
    ],
    ['公司注册在哪个府？', '注册办事处位于哪个府？', '注册地址中注明的是哪个府？'],
  ),
  item(
    'director_count',
    1,
    [
      'How many directors does the company have?',
      'How many directors are listed on the certificate?',
      "What is the company's total number of directors?",
    ],
    ['บริษัทมีกรรมการกี่คน', 'หนังสือรับรองระบุกรรมการกี่คน', 'บริษัทมีกรรมการทั้งหมดกี่คน'],
    ['公司有几位董事？', '注册证明列有几位董事？', '公司的董事总数是多少？'],
  ),
  item(
    'director_identity',
    1,
    [
      "Who are the company's registered directors?",
      'Which names are listed as company directors?',
      'Who is officially registered as a director?',
    ],
    [
      'กรรมการที่จดทะเบียนของบริษัทมีใครบ้าง',
      'ชื่อใดบ้างที่ระบุเป็นกรรมการบริษัท',
      'ใครจดทะเบียนเป็นกรรมการอย่างเป็นทางการ',
    ],
    ['公司的注册董事是谁？', '哪些姓名被列为公司董事？', '谁被正式注册为董事？'],
  ),
  item(
    'signing_authority',
    1,
    [
      'Who can legally sign for the company?',
      "What is the company's signing rule?",
      'How must documents be signed to bind the company?',
    ],
    [
      'ใครมีอำนาจลงนามแทนบริษัทตามกฎหมาย',
      'เงื่อนไขการลงนามของบริษัทคืออะไร',
      'ต้องลงนามเอกสารอย่างไรจึงผูกพันบริษัท',
    ],
    ['谁可以合法代表公司签字？', '公司的签字规则是什么？', '文件应如何签署才能对公司生效？'],
  ),
  item(
    'registered_capital',
    2,
    [
      "What is the company's registered capital?",
      'How much registered capital does the company have?',
      "Which amount is the company's registered capital?",
    ],
    [
      'ทุนจดทะเบียนของบริษัทคือเท่าใด',
      'บริษัทมีทุนจดทะเบียนเท่าใด',
      'จำนวนใดคือทุนจดทะเบียนของบริษัท',
    ],
    ['公司的注册资本是多少？', '公司有多少注册资本？', '哪个金额是公司的注册资本？'],
  ),
  item(
    'shareholder_count',
    2,
    [
      'How many shareholders does the company have?',
      'How many people are listed as shareholders?',
      "What is the company's total number of shareholders?",
    ],
    ['บริษัทมีผู้ถือหุ้นกี่คน', 'มีรายชื่อผู้ถือหุ้นกี่คน', 'บริษัทมีผู้ถือหุ้นทั้งหมดกี่คน'],
    ['公司有几位股东？', '股东名册列有几人？', '公司的股东总数是多少？'],
  ),
  item(
    'learner_shareholding',
    2,
    [
      'How many shares do you own?',
      'What percentage of the company do you own?',
      'Which shareholding belongs to you?',
    ],
    ['คุณถือหุ้นกี่หุ้น', 'คุณถือหุ้นคิดเป็นกี่เปอร์เซ็นต์ของบริษัท', 'จำนวนหุ้นใดเป็นของคุณ'],
    ['您持有多少股份？', '您拥有公司多少百分比？', '哪项持股属于您？'],
  ),
  item(
    'actual_business',
    3,
    [
      'What business does the company actually do?',
      "What is the company's main business?",
      "Which description best explains the company's business?",
    ],
    [
      'บริษัททำธุรกิจอะไรจริง',
      'ธุรกิจหลักของบริษัทคืออะไร',
      'คำอธิบายใดตรงกับธุรกิจของบริษัทที่สุด',
    ],
    ['公司实际从事什么业务？', '公司的主营业务是什么？', '哪项描述最符合公司的业务？'],
  ),
  item(
    'products_services',
    3,
    [
      'What products or services does the company sell?',
      'What does the company provide to customers?',
      'Which products or services belong to the company?',
    ],
    ['บริษัทขายสินค้าหรือบริการอะไร', 'บริษัทให้อะไรแก่ลูกค้า', 'สินค้าหรือบริการใดเป็นของบริษัท'],
    ['公司销售什么产品或服务？', '公司向客户提供什么？', '哪些产品或服务属于公司？'],
  ),
  item(
    'business_purpose',
    3,
    [
      'Why was the company established?',
      'What was the company set up to do?',
      'What is the main purpose of the company?',
    ],
    ['บริษัทจัดตั้งขึ้นเพราะอะไร', 'บริษัทตั้งขึ้นเพื่อทำอะไร', 'วัตถุประสงค์หลักของบริษัทคืออะไร'],
    ['公司为什么成立？', '公司成立是为了做什么？', '公司的主要目的是什么？'],
  ),
  item(
    'main_clients',
    3,
    [
      "Who are the company's main customers?",
      'What kind of customers does the company serve?',
      'Which customer group normally buys from the company?',
    ],
    [
      'ลูกค้าหลักของบริษัทคือใคร',
      'บริษัทให้บริการลูกค้าประเภทใด',
      'ลูกค้ากลุ่มใดซื้อสินค้าจากบริษัทเป็นหลัก',
    ],
    ['公司的主要客户是谁？', '公司服务哪类客户？', '哪类客户通常向公司购买？'],
  ),
  item(
    'client_origin',
    3,
    [
      'How does the company find customers?',
      "Where do the company's customers come from?",
      'Which channels does the company use to reach customers?',
    ],
    ['บริษัทหาลูกค้าอย่างไร', 'ลูกค้าของบริษัทมาจากช่องทางใด', 'บริษัทใช้ช่องทางใดเข้าถึงลูกค้า'],
    ['公司如何寻找客户？', '公司的客户来自哪里？', '公司通过哪些渠道接触客户？'],
  ),
  item(
    'main_suppliers',
    3,
    [
      "Who are the company's main suppliers?",
      'Where does the company buy its goods or materials?',
      'What kind of suppliers does the company use?',
    ],
    [
      'ซัพพลายเออร์หลักของบริษัทคือใคร',
      'บริษัทซื้อสินค้าหรือวัตถุดิบจากที่ใด',
      'บริษัทใช้ซัพพลายเออร์ประเภทใด',
    ],
    ['公司的主要供应商是谁？', '公司从哪里购买商品或材料？', '公司使用哪类供应商？'],
  ),
  item(
    'actual_business_location',
    3,
    [
      'Where does the company actually operate?',
      "What is the company's real place of business?",
      'From which location does the company conduct its business?',
    ],
    [
      'บริษัทดำเนินธุรกิจจริงที่ไหน',
      'สถานที่ประกอบธุรกิจจริงของบริษัทคือที่ใด',
      'บริษัทดำเนินงานจากสถานที่ใด',
    ],
    ['公司实际在哪里经营？', '公司的实际经营地点在哪里？', '公司从哪个地点开展业务？'],
  ),
  item(
    'monthly_revenue',
    4,
    [
      "What is the company's estimated monthly revenue?",
      'About how much revenue does the company make each month?',
      "Which amount is the company's expected monthly revenue?",
    ],
    [
      'รายได้ต่อเดือนโดยประมาณของบริษัทคือเท่าใด',
      'บริษัทมีรายได้ประมาณเท่าใดต่อเดือน',
      'จำนวนใดคือรายได้ต่อเดือนที่คาดไว้ของบริษัท',
    ],
    ['公司的预计月收入是多少？', '公司每月大约有多少收入？', '哪个金额是公司的预计月收入？'],
  ),
  item(
    'revenue_basis',
    4,
    [
      'How was the monthly revenue calculated?',
      'What information supports the monthly revenue estimate?',
      'Which explanation correctly describes the revenue calculation?',
    ],
    [
      'รายได้ต่อเดือนคำนวณอย่างไร',
      'ข้อมูลใดใช้สนับสนุนการประมาณรายได้ต่อเดือน',
      'คำอธิบายใดตรงกับการคำนวณรายได้',
    ],
    ['月收入是如何计算的？', '哪些信息支持月收入估算？', '哪项说明正确描述了收入计算？'],
  ),
  item(
    'average_transaction',
    4,
    [
      'What is the average amount per transaction?',
      'About how much is one sale on average?',
      "Which amount is the company's average transaction?",
    ],
    [
      'ยอดเฉลี่ยต่อธุรกรรมคือเท่าใด',
      'ยอดขายหนึ่งรายการเฉลี่ยประมาณเท่าใด',
      'จำนวนใดคือยอดธุรกรรมเฉลี่ยของบริษัท',
    ],
    ['平均每笔交易金额是多少？', '每笔销售平均大约多少钱？', '哪个金额是公司的平均交易金额？'],
  ),
  item(
    'monthly_transactions',
    4,
    [
      'How many transactions are expected each month?',
      'About how many sales does the company make in one month?',
      "Which number is the company's estimated monthly transaction count?",
    ],
    [
      'คาดว่าจะมีธุรกรรมกี่รายการต่อเดือน',
      'บริษัทขายได้ประมาณกี่รายการในหนึ่งเดือน',
      'จำนวนใดคือธุรกรรมต่อเดือนโดยประมาณของบริษัท',
    ],
    ['预计每月有多少笔交易？', '公司一个月大约有多少笔销售？', '哪个数字是公司的预计月交易量？'],
  ),
  item(
    'startup_source_of_funds',
    4,
    [
      "Where did the company's start-up money come from?",
      "What is the source of the company's starting capital?",
      "Who provided the company's initial funds?",
    ],
    [
      'เงินเริ่มต้นของบริษัทมาจากไหน',
      'แหล่งที่มาของทุนเริ่มต้นคืออะไร',
      'ใครเป็นผู้ให้เงินทุนเริ่มต้นแก่บริษัท',
    ],
    ['公司的启动资金来自哪里？', '公司初始资本的来源是什么？', '谁提供了公司的初始资金？'],
  ),
  item(
    'first_incoming_funds',
    4,
    [
      'What will the first money entering the account be?',
      'Where will the first deposit into the company account come from?',
      "What is the purpose of the company's first incoming money?",
    ],
    [
      'เงินก้อนแรกที่เข้าบัญชีจะเป็นเงินอะไร',
      'เงินฝากก้อนแรกเข้าบัญชีบริษัทจะมาจากไหน',
      'เงินก้อนแรกที่เข้าบัญชีมีวัตถุประสงค์อะไร',
    ],
    ['首笔进入账户的资金是什么？', '公司账户的首笔存款来自哪里？', '首笔入账资金的用途是什么？'],
  ),
  item(
    'bank_account_purpose',
    4,
    [
      'Why does the company need a bank account?',
      'What will the company use its bank account for?',
      'What is the main purpose of opening the company account?',
    ],
    [
      'ทำไมบริษัทจึงต้องมีบัญชีธนาคาร',
      'บริษัทจะใช้บัญชีธนาคารทำอะไร',
      'วัตถุประสงค์หลักของการเปิดบัญชีบริษัทคืออะไร',
    ],
    ['公司为什么需要银行账户？', '公司将如何使用银行账户？', '开设公司账户的主要目的是什么？'],
  ),
  item(
    'promptpay_qr_purpose',
    4,
    [
      'Why does the company need PromptPay or QR?',
      'How will the company use PromptPay or QR?',
      'Why are QR payments useful for the company?',
    ],
    [
      'ทำไมบริษัทจึงต้องใช้พร้อมเพย์หรือ QR',
      'บริษัทจะใช้พร้อมเพย์หรือ QR อย่างไร',
      'การชำระด้วย QR มีประโยชน์ต่อบริษัทอย่างไร',
    ],
    [
      '公司为什么需要 PromptPay 或二维码？',
      '公司将如何使用 PromptPay 或二维码？',
      '二维码付款为什么对公司有用？',
    ],
  ),
  item(
    'internet_banking_control',
    5,
    [
      "Who should control the company's internet banking?",
      "Who should have access to the company's online banking?",
      'Who is responsible for operating the company bank account online?',
    ],
    [
      'ใครควรควบคุมอินเทอร์เน็ตแบงกิ้งของบริษัท',
      'ใครควรเข้าถึงธนาคารออนไลน์ของบริษัท',
      'ใครรับผิดชอบการใช้บัญชีบริษัททางออนไลน์',
    ],
    ['谁应控制公司的网上银行？', '谁应有权使用公司的网上银行？', '谁负责在线操作公司银行账户？'],
  ),
  item(
    'otp_control',
    5,
    [
      'Who should keep the phone that receives the bank OTP?',
      "Who should control the company's OTP?",
      'Who should receive verification codes for the company account?',
    ],
    [
      'ใครควรเก็บโทรศัพท์ที่รับ OTP ของธนาคาร',
      'ใครควรควบคุม OTP ของบริษัท',
      'ใครควรรับรหัสยืนยันของบัญชีบริษัท',
    ],
    ['谁应保管接收银行 OTP 的手机？', '谁应控制公司的 OTP？', '谁应接收公司账户的验证码？'],
  ),
  item(
    'transaction_explanation',
    5,
    [
      'What should you do when the bank asks about a transfer?',
      'How should you explain money entering or leaving the account?',
      'What information should you give when the bank checks a transaction?',
    ],
    [
      'เมื่อธนาคารถามเรื่องการโอนเงิน คุณควรทำอย่างไร',
      'ควรอธิบายเงินเข้าออกบัญชีอย่างไร',
      'เมื่อธนาคารตรวจธุรกรรมควรให้ข้อมูลอะไร',
    ],
    [
      '银行询问转账时您应该怎么做？',
      '应如何解释账户的资金进出？',
      '银行核查交易时应提供什么信息？',
    ],
  ),
  item(
    'supporting_documents',
    5,
    [
      'What documents should support a business payment?',
      'What evidence should the company keep for its transactions?',
      'Which documents can be used to explain company payments?',
    ],
    [
      'เอกสารใดควรรองรับการชำระเงินของธุรกิจ',
      'บริษัทควรเก็บหลักฐานอะไรสำหรับธุรกรรม',
      'เอกสารใดใช้อธิบายการชำระเงินของบริษัทได้',
    ],
    ['业务付款应由哪些文件支持？', '公司应为交易保留什么凭证？', '哪些文件可用于说明公司付款？'],
  ),
  item(
    'answer_consistency',
    5,
    [
      'How should your answers compare with the company documents?',
      'What should you check before answering the bank?',
      'Which statement describes a good answer to the bank?',
    ],
    [
      'คำตอบของคุณควรตรงกับเอกสารบริษัทอย่างไร',
      'ควรตรวจสอบอะไรก่อนตอบธนาคาร',
      'ข้อความใดอธิบายคำตอบที่ดีต่อธนาคาร',
    ],
    [
      '您的回答应如何与公司文件对应？',
      '回答银行前应检查什么？',
      '哪项说法描述了对银行的良好回答？',
    ],
  ),
];

export function syllabusItem(conceptKey: string): TrainingSyllabusItem | null {
  return TRAINING_SYLLABUS.find((item) => item.conceptKey === conceptKey) ?? null;
}
