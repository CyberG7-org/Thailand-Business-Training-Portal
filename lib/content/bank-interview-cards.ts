import type { AppLocale } from '@/i18n/routing';
import type { ConceptGroup } from '@/lib/domain/bank-interview';

export type StarterCard = {
  contentKey: string;
  sortOrder: number;
  conceptGroup: ConceptGroup | null;
  localizations: Record<AppLocale, { title: string; body: string }>;
};

/**
 * Five direct cheat sheets covering every assessed concept. The optional customer channel text
 * is rendered by locale, so a company without a website never gets an empty website label.
 */
export const BANK_INTERVIEW_CARDS: StarterCard[] = [
  {
    contentKey: 'bank-interview-1-identity',
    sortOrder: 10,
    conceptGroup: 'identity',
    localizations: {
      en: {
        title: 'Company identity and directors (1/5)',
        body: `Learn these facts exactly as they appear in the company documents.

| What to remember | Your company answer |
|---|---|
| Full registered name | **{company_name_th}** ({company_name_en}) |
| 13-digit registration number | {juristic_id} |
| Registration date | {registered_on} |
| Registered address | {head_office_address} |
| Directors | {directors_count} — {directors} |
| Who can sign for the company | {signing_authority} |

**The bank may ask:** What is the full registered name? What are the registration number and date? Where is the company registered? Who are the directors and who can sign?

**Remember:** use the full name and exact numbers from the documents. The registered address can differ from the real place of business.`,
      },
      th: {
        title: 'ข้อมูลบริษัทและกรรมการ (1/5)',
        body: `จำข้อมูลต่อไปนี้ให้ตรงกับเอกสารบริษัท

| สิ่งที่ต้องจำ | คำตอบของบริษัทคุณ |
|---|---|
| ชื่อเต็มที่จดทะเบียน | **{company_name_th}** ({company_name_en}) |
| เลขทะเบียน 13 หลัก | {juristic_id} |
| วันที่จดทะเบียน | {registered_on} |
| ที่อยู่จดทะเบียน | {head_office_address} |
| กรรมการ | {directors_count} คน — {directors} |
| ผู้มีอำนาจลงนาม | {signing_authority} |

**ธนาคารอาจถาม:** ชื่อเต็ม เลขทะเบียน วันที่จดทะเบียน ที่อยู่ กรรมการ และผู้มีอำนาจลงนามคืออะไร

**จำไว้:** ชื่อและตัวเลขต้องตรงเอกสาร ที่อยู่จดทะเบียนอาจไม่ใช่สถานที่ทำธุรกิจจริง`,
      },
      zh: {
        title: '公司身份和董事（1/5）',
        body: `请准确记住公司文件中的以下信息。

| 要记住的内容 | 您公司的答案 |
|---|---|
| 完整注册名称 | **{company_name_th}**（{company_name_en}） |
| 13 位注册号 | {juristic_id} |
| 注册日期 | {registered_on} |
| 注册地址 | {head_office_address} |
| 董事 | {directors_count} 位 — {directors} |
| 有权代表公司签字的人 | {signing_authority} |

**银行可能会问：** 完整名称、注册号、注册日期、注册地址、董事和签字权是什么？

**记住：** 名称和数字必须与文件一致。注册地址可能与实际经营地点不同。`,
      },
    },
  },
  {
    contentKey: 'bank-interview-2-ownership',
    sortOrder: 20,
    conceptGroup: 'ownership',
    localizations: {
      en: {
        title: 'Capital, shareholders and your role (2/5)',
        body: `Know who owns the company and what you do in it.

| What to remember | Your answer |
|---|---|
| Registered capital | {registered_capital} Baht |
| Total shares and value | {total_shares} shares at {par_value} Baht each |
| Shareholders | {shareholders_count} — {shareholders} |
| Your shares | {my_shares} shares ({my_share_percent}%) |
| Your name and position | {my_name} — {my_position} |
| Your daily responsibilities | {my_responsibilities} |
| Relationship to other shareholders | {my_relationship} |

**The bank may ask:** What is the capital? How many shareholders are there? How many shares do you own? What is your position and daily work?

**Remember:** registered capital ÷ value per share = total shares. Use your own words for your work, but keep the facts consistent.`,
      },
      th: {
        title: 'ทุน ผู้ถือหุ้น และหน้าที่ของคุณ (2/5)',
        body: `รู้ว่าใครเป็นเจ้าของบริษัทและคุณทำหน้าที่อะไร

| สิ่งที่ต้องจำ | คำตอบของคุณ |
|---|---|
| ทุนจดทะเบียน | {registered_capital} บาท |
| จำนวนหุ้นและมูลค่าหุ้น | {total_shares} หุ้น หุ้นละ {par_value} บาท |
| ผู้ถือหุ้น | {shareholders_count} คน — {shareholders} |
| หุ้นของคุณ | {my_shares} หุ้น ({my_share_percent}%) |
| ชื่อและตำแหน่ง | {my_name} — {my_position} |
| หน้าที่ประจำวัน | {my_responsibilities} |
| ความสัมพันธ์กับผู้ถือหุ้นอื่น | {my_relationship} |

**ธนาคารอาจถาม:** ทุนเท่าใด มีผู้ถือหุ้นกี่คน คุณถือหุ้นกี่หุ้น และทำหน้าที่อะไร

**จำไว้:** ทุนจดทะเบียน ÷ มูลค่าต่อหุ้น = จำนวนหุ้นทั้งหมด อธิบายงานด้วยคำของคุณเองแต่ข้อมูลต้องตรงกัน`,
      },
      zh: {
        title: '资本、股东和您的角色（2/5）',
        body: `了解谁拥有公司，以及您在公司中的工作。

| 要记住的内容 | 您的答案 |
|---|---|
| 注册资本 | {registered_capital} 泰铢 |
| 总股份和每股价值 | {total_shares} 股，每股 {par_value} 泰铢 |
| 股东 | {shareholders_count} 位 — {shareholders} |
| 您的股份 | {my_shares} 股（{my_share_percent}%） |
| 您的姓名和职位 | {my_name} — {my_position} |
| 您的日常职责 | {my_responsibilities} |
| 与其他股东的关系 | {my_relationship} |

**银行可能会问：** 资本是多少？有几位股东？您有多少股份？职位和日常工作是什么？

**记住：** 注册资本 ÷ 每股价值 = 总股份。可用自己的话说明工作，但事实必须一致。`,
      },
    },
  },
  {
    contentKey: 'bank-interview-3-business',
    sortOrder: 30,
    conceptGroup: 'business_plan',
    localizations: {
      en: {
        title: 'Business, customers and suppliers (3/5)',
        body: `Explain the real business in one or two simple sentences.

| What to remember | Your company answer |
|---|---|
| What the company actually does | {nature_of_business} |
| Products or services | {products_services} |
| Why the company was established | {business_purpose} |
| Main customers | {main_clients} — {clients_location} |
| Where customers are found | {customer_channels} |
| Main suppliers | {main_suppliers} — {suppliers_location} |
| Actual place of business | {business_address} |
| Registered business categories | {business_categories} |
| Has business started? | {operations_status} |

**The bank may ask:** What does the company do and sell? Why was it established? Who are the customers and suppliers? How do you find customers? Where do you operate?

**Remember:** the real business must make sense with the registered objectives. If there is no website, do not mention one.`,
      },
      th: {
        title: 'ธุรกิจ ลูกค้า และซัพพลายเออร์ (3/5)',
        body: `อธิบายธุรกิจจริงให้จบใน 1–2 ประโยคง่าย ๆ

| สิ่งที่ต้องจำ | คำตอบของบริษัทคุณ |
|---|---|
| บริษัททำอะไรจริง | {nature_of_business} |
| สินค้าหรือบริการ | {products_services} |
| เหตุผลที่จัดตั้งบริษัท | {business_purpose} |
| ลูกค้าหลัก | {main_clients} — {clients_location} |
| วิธีหาลูกค้า | {customer_channels} |
| ซัพพลายเออร์หลัก | {main_suppliers} — {suppliers_location} |
| สถานที่ทำธุรกิจจริง | {business_address} |
| ประเภทธุรกิจที่จดทะเบียน | {business_categories} |
| เริ่มทำธุรกิจแล้วหรือยัง | {operations_status} |

**ธนาคารอาจถาม:** บริษัททำและขายอะไร จัดตั้งเพื่ออะไร ลูกค้าและซัพพลายเออร์คือใคร หาลูกค้าอย่างไร และทำธุรกิจที่ไหน

**จำไว้:** ธุรกิจจริงต้องสอดคล้องกับวัตถุประสงค์ ถ้าไม่มีเว็บไซต์ ไม่ต้องพูดถึงเว็บไซต์`,
      },
      zh: {
        title: '业务、客户和供应商（3/5）',
        body: `用一两句简单的话说明公司的实际业务。

| 要记住的内容 | 您公司的答案 |
|---|---|
| 公司实际做什么 | {nature_of_business} |
| 产品或服务 | {products_services} |
| 公司成立的目的 | {business_purpose} |
| 主要客户 | {main_clients} — {clients_location} |
| 如何寻找客户 | {customer_channels} |
| 主要供应商 | {main_suppliers} — {suppliers_location} |
| 实际经营地点 | {business_address} |
| 注册业务类别 | {business_categories} |
| 是否已开始经营 | {operations_status} |

**银行可能会问：** 公司做什么、销售什么？为什么成立？客户和供应商是谁？如何找到客户？在哪里经营？

**记住：** 实际业务应与注册目的相符。没有网站时，不要提到网站。`,
      },
    },
  },
  {
    contentKey: 'bank-interview-4-role',
    sortOrder: 40,
    conceptGroup: 'personal',
    localizations: {
      en: {
        title: 'Money and transactions (4/5)',
        body: `These figures come from the uploaded invoices and prepared answers.

| What to remember | Your company answer |
|---|---|
| Estimated monthly revenue | {monthly_revenue} |
| How it was calculated | {revenue_basis} |
| Average amount per transaction | {average_transaction} |
| Estimated transactions per month | {monthly_transactions} |
| Expected monthly money movement | {monthly_volume} |
| Start-up source of funds | {source_of_funds} |
| First money entering the account | {first_incoming_funds} |
| Why the account is needed | {account_purpose} |
| Why PromptPay or QR is needed | {promptpay_qr_purpose} |
| Expected transaction pattern | {transaction_details} |

**Calculation:** add all invoice totals; count the **different invoice dates**; daily revenue = total ÷ different dates; monthly revenue = daily revenue × 30; average transaction = total ÷ invoices.

**Remember:** these are estimates based on the invoices. Do not invent a different figure.`,
      },
      th: {
        title: 'เงินและธุรกรรม (4/5)',
        body: `ตัวเลขเหล่านี้มาจากใบแจ้งหนี้และคำตอบที่เตรียมไว้

| สิ่งที่ต้องจำ | คำตอบของบริษัทคุณ |
|---|---|
| รายได้ต่อเดือนโดยประมาณ | {monthly_revenue} |
| วิธีคำนวณรายได้ | {revenue_basis} |
| ยอดเฉลี่ยต่อธุรกรรม | {average_transaction} |
| จำนวนธุรกรรมต่อเดือน | {monthly_transactions} |
| เงินเข้าออกต่อเดือนที่คาดไว้ | {monthly_volume} |
| แหล่งเงินเริ่มต้น | {source_of_funds} |
| เงินก้อนแรกที่จะเข้าบัญชี | {first_incoming_funds} |
| เหตุผลที่ต้องมีบัญชี | {account_purpose} |
| เหตุผลที่ใช้พร้อมเพย์หรือ QR | {promptpay_qr_purpose} |
| รูปแบบธุรกรรมที่คาดไว้ | {transaction_details} |

**วิธีคำนวณ:** รวมยอดใบแจ้งหนี้ นับ **วันที่ไม่ซ้ำกัน** รายได้ต่อวัน = ยอดรวม ÷ จำนวนวันที่ไม่ซ้ำ รายได้ต่อเดือน = ต่อวัน × 30 และยอดเฉลี่ยต่อธุรกรรม = ยอดรวม ÷ จำนวนใบแจ้งหนี้

**จำไว้:** เป็นตัวเลขประมาณการจากใบแจ้งหนี้ อย่าคิดตัวเลขใหม่เอง`,
      },
      zh: {
        title: '资金和交易（4/5）',
        body: `这些数字来自上传的发票和准备好的答案。

| 要记住的内容 | 您公司的答案 |
|---|---|
| 预计月收入 | {monthly_revenue} |
| 收入计算方法 | {revenue_basis} |
| 平均每笔交易金额 | {average_transaction} |
| 预计每月交易数量 | {monthly_transactions} |
| 预计每月资金进出 | {monthly_volume} |
| 启动资金来源 | {source_of_funds} |
| 首笔进入账户的资金 | {first_incoming_funds} |
| 开户目的 | {account_purpose} |
| 使用 PromptPay 或二维码的原因 | {promptpay_qr_purpose} |
| 预计交易情况 | {transaction_details} |

**计算方法：** 发票总额相加；计算 **不同发票日期**；日收入 = 总额 ÷ 不同日期数；月收入 = 日收入 × 30；平均交易 = 总额 ÷ 发票数。

**记住：** 这是根据发票估算的数字，不要编造其他数字。`,
      },
    },
  },
  {
    contentKey: 'bank-interview-5-tips',
    sortOrder: 50,
    conceptGroup: null,
    localizations: {
      en: {
        title: 'Bank safety and confident answers (5/5)',
        body: `Use these safe, simple answers.

| The bank asks | A good answer |
|---|---|
| Who controls internet banking? | The authorised company director controls it. |
| Who keeps the OTP phone? | The authorised person keeps and controls it. |
| How do you explain a transfer? | Say who paid whom, why, the amount and the date. |
| What supports a payment? | An invoice, agreement, receipt or matching business document. |
| What if the bank checks? | Keep every answer consistent with the documents and real activity. |

**Answer in four steps:** listen to the whole question; give the direct answer first; add one short explanation if needed; ask the officer to repeat if unsure—do not guess.

You do not need difficult words. Clear, honest and consistent answers are enough.`,
      },
      th: {
        title: 'ความปลอดภัยและการตอบอย่างมั่นใจ (5/5)',
        body: `ใช้คำตอบที่ปลอดภัยและเข้าใจง่าย

| ธนาคารถาม | คำตอบที่ดี |
|---|---|
| ใครควบคุมอินเทอร์เน็ตแบงกิ้ง | กรรมการผู้มีอำนาจของบริษัท |
| ใครเก็บโทรศัพท์รับ OTP | ผู้มีอำนาจเป็นผู้เก็บและควบคุม |
| อธิบายการโอนเงินอย่างไร | บอกว่าใครจ่ายให้ใคร จ่ายเพื่ออะไร จำนวนเท่าใด และวันไหน |
| ใช้อะไรยืนยันการจ่าย | ใบแจ้งหนี้ ข้อตกลง ใบเสร็จ หรือเอกสารธุรกิจที่ตรงกัน |
| ถ้าธนาคารตรวจคำตอบ | ตอบให้ตรงกับเอกสารและธุรกิจจริงทุกครั้ง |

**ตอบ 4 ขั้นตอน:** ฟังให้จบ ตอบตรง ๆ ก่อน อธิบายสั้น ๆ เมื่อจำเป็น และถ้าไม่แน่ใจให้ขอถามซ้ำ—อย่าเดา

ไม่ต้องใช้คำยาก แค่ตอบให้ชัดเจน จริง และสอดคล้องกันก็เพียงพอ`,
      },
      zh: {
        title: '银行安全和自信回答（5/5）',
        body: `请使用安全、简单的回答。

| 银行的问题 | 合适的回答 |
|---|---|
| 谁控制网上银行？ | 公司授权董事控制。 |
| 谁保管接收 OTP 的手机？ | 授权人员保管和控制。 |
| 如何说明转账？ | 说明谁向谁付款、原因、金额和日期。 |
| 什么支持付款？ | 发票、协议、收据或相符的业务文件。 |
| 银行核查时怎么办？ | 回答应与文件和实际业务一致。 |

**四步回答：** 听完问题；先直接回答；需要时补充一句说明；不确定时请工作人员重复—不要猜。

不需要复杂词语。清楚、诚实、前后一致就足够了。`,
      },
    },
  },
];

export function cardConceptGroup(contentKey: string): ConceptGroup | null {
  return BANK_INTERVIEW_CARDS.find((card) => card.contentKey === contentKey)?.conceptGroup ?? null;
}
