import type { AppLocale } from '@/i18n/routing';
import type { ConceptGroup } from '@/lib/domain/bank-interview';

/**
 * Starter study cards built on the bank-interview concepts (decision D39). Placeholders render
 * with each learner's own company facts (lenient: a missing fact shows as "—"). Admins load them
 * once from Admin → Study content and edit freely afterwards.
 */
export type StarterCard = {
  contentKey: string;
  sortOrder: number;
  /** The bank-interview concept group the card teaches (null for advice cards). */
  conceptGroup: ConceptGroup | null;
  localizations: Record<AppLocale, { title: string; body: string }>;
};

export const BANK_INTERVIEW_CARDS: StarterCard[] = [
  {
    contentKey: 'bank-interview-1-identity',
    sortOrder: 10,
    conceptGroup: 'identity',
    localizations: {
      th: {
        title: 'ข้อมูลบริษัทที่ธนาคารจะถาม (1/5): ตัวตนของบริษัท',
        body: `เจ้าหน้าที่ธนาคารจะเริ่มด้วยคำถามพื้นฐานเกี่ยวกับบริษัทของคุณ ตอบให้ตรงกับ **หนังสือรับรอง** ทุกครั้ง

| คำถามที่ธนาคารถาม | คำตอบของคุณ (จากหนังสือรับรอง) |
|---|---|
| บริษัทชื่ออะไร | **{company_name_th}** ({company_name_en}) |
| บริษัทจดทะเบียนเมื่อใด | {registered_on} |
| บริษัทมีกรรมการกี่คน | {directors_count} คน — {directors} |
| บริษัทจดทะเบียนที่ไหน / ที่อยู่จดทะเบียน | {head_office_address} (จังหวัด{province}) |
| เลขทะเบียนนิติบุคคล | {juristic_id} |

**เคล็ดลับ**
- พูดชื่อบริษัทเต็ม ๆ ตามที่จดทะเบียน ทั้งภาษาไทยและอังกฤษถ้าถูกถาม
- วันที่จดทะเบียนตอบเป็นวัน/เดือน/ปี พ.ศ. ก็ได้ แต่ต้องเป็นวันเดียวกับในหนังสือรับรอง
- ที่อยู่จดทะเบียนอาจต่างจากที่ทำงานจริง — ธนาคารถามทั้งสองอย่าง (ดูการ์ดที่ 3)`,
      },
      en: {
        title: "What the bank will ask (1/5): the company's identity",
        body: `The bank officer starts with basic questions about your company. Answer exactly as the **certificate** says.

| The bank asks | Your answer (from the certificate) |
|---|---|
| What is the company's name? | **{company_name_th}** ({company_name_en}) |
| When was the company incorporated? | {registered_on} |
| How many directors does it have? | {directors_count} — {directors} |
| Where is it registered / registered address? | {head_office_address} (province: {province}) |
| Juristic person registration number | {juristic_id} |

**Tips**
- Say the full registered name, Thai and English if asked.
- The incorporation date may be given in the Buddhist calendar, but it must be the date on the certificate.
- The registered address can differ from where you actually work — the bank asks about both (see card 3).`,
      },
      zh: {
        title: '银行会问什么（1/5）：公司身份',
        body: `银行工作人员会先问公司的基本信息。请按 **注册证明** 上的内容回答。

| 银行的问题 | 您的答案（来自注册证明） |
|---|---|
| 公司叫什么名字？ | **{company_name_th}**（{company_name_en}） |
| 公司什么时候注册成立？ | {registered_on} |
| 公司有几位董事？ | {directors_count} 位 — {directors} |
| 公司在哪里注册？注册地址？ | {head_office_address}（{province}府） |
| 法人注册号 | {juristic_id} |

**要点**
- 说出完整的注册名称，如被问到也要说英文名。
- 注册日期可用佛历回答，但必须与证明上的日期一致。
- 注册地址可能与实际办公地址不同——银行两者都会问（见第 3 张卡）。`,
      },
    },
  },
  {
    contentKey: 'bank-interview-2-ownership',
    sortOrder: 20,
    conceptGroup: 'ownership',
    localizations: {
      th: {
        title: 'ข้อมูลบริษัทที่ธนาคารจะถาม (2/5): ทุนและผู้ถือหุ้น',
        body: `ธนาคารต้องรู้ว่าใครเป็นเจ้าของบริษัท คำตอบมาจาก **บัญชีรายชื่อผู้ถือหุ้น (บอจ.5)** และหนังสือรับรอง

| คำถามที่ธนาคารถาม | คำตอบของคุณ |
|---|---|
| ทุนจดทะเบียนเท่าใด | {registered_capital} บาท |
| มีหุ้นทั้งหมดกี่หุ้น | {total_shares} หุ้น มูลค่าหุ้นละ {par_value} บาท |
| บริษัทมีผู้ถือหุ้นกี่คน | {shareholders_count} คน — {shareholders} |
| คุณถือหุ้นกี่หุ้น คิดเป็นกี่เปอร์เซ็นต์ | {my_shares} หุ้น ({my_share_percent}%) |
| คุณรู้จักผู้ถือหุ้นคนอื่นไหม ความสัมพันธ์คืออะไร | {my_relationship} |

**เคล็ดลับ**
- ทุนจดทะเบียน ÷ มูลค่าหุ้น = จำนวนหุ้นทั้งหมด ตรวจให้ตรงกัน
- ตอบเรื่องผู้ถือหุ้นคนอื่นอย่างเป็นธรรมชาติและตรงกับความจริงที่เตรียมไว้`,
      },
      en: {
        title: 'What the bank will ask (2/5): capital and shareholders',
        body: `The bank needs to know who owns the company. The answers come from the **shareholder list (Bor.Or.Jor.5)** and the certificate.

| The bank asks | Your answer |
|---|---|
| What is the registered capital? | {registered_capital} Baht |
| What is the total number of shares? | {total_shares} shares at {par_value} Baht each |
| How many shareholders are there? | {shareholders_count} — {shareholders} |
| How many shares do you hold, and what percentage? | {my_shares} shares ({my_share_percent}%) |
| Do you know the other shareholders? Relationship? | {my_relationship} |

**Tips**
- Registered capital ÷ par value = total shares. Make sure they agree.
- Talk about the other shareholders naturally and consistently with what you prepared.`,
      },
      zh: {
        title: '银行会问什么（2/5）：资本与股东',
        body: `银行需要了解公司的所有者。答案来自 **股东名册（บอจ.5）** 和注册证明。

| 银行的问题 | 您的答案 |
|---|---|
| 注册资本是多少？ | {registered_capital} 泰铢 |
| 一共有多少股份？ | {total_shares} 股，每股 {par_value} 泰铢 |
| 公司有几位股东？ | {shareholders_count} 位 — {shareholders} |
| 您持有多少股份？占多少比例？ | {my_shares} 股（{my_share_percent}%） |
| 您认识其他股东吗？是什么关系？ | {my_relationship} |

**要点**
- 注册资本 ÷ 每股面值 = 股份总数，请核对一致。
- 谈到其他股东时要自然，并与事先准备的内容一致。`,
      },
    },
  },
  {
    contentKey: 'bank-interview-3-business',
    sortOrder: 30,
    conceptGroup: 'business_plan',
    localizations: {
      th: {
        title: 'ข้อมูลบริษัทที่ธนาคารจะถาม (3/5): ธุรกิจและการดำเนินงาน',
        body: `ธนาคารต้องเข้าใจว่าบริษัททำอะไรและเงินจะเข้าออกอย่างไร คำตอบส่วนนี้มาจาก **วัตถุที่ประสงค์** และข้อมูลที่บริษัทเตรียมไว้

| คำถามที่ธนาคารถาม | คำตอบของคุณ |
|---|---|
| บริษัททำธุรกิจหลักอะไร | {business_categories} |
| บริษัทเปิดบัญชีเพื่ออะไร | {account_purpose} |
| เงินเข้าออกต่อเดือนประมาณเท่าใด | {monthly_volume} |
| ลูกค้าหลักอยู่ที่ไหน | {clients_location} |
| ซัพพลายเออร์หลักอยู่ที่ไหน | {suppliers_location} |
| แหล่งที่มาของเงินทุน | {source_of_funds} |
| สถานที่ประกอบธุรกิจจริง | {business_address} |
| เริ่มดำเนินธุรกิจแล้วหรือยัง | {operations_status} |

**เคล็ดลับ**
- อธิบายธุรกิจด้วยประโยคสั้น ๆ 1–2 ประโยค สอดคล้องกับวัตถุที่ประสงค์ที่จดทะเบียน
- ตัวเลขประมาณการต้องสมเหตุสมผลกับขนาดธุรกิจและทุนจดทะเบียน`,
      },
      en: {
        title: 'What the bank will ask (3/5): the business and its operations',
        body: `The bank must understand what the company does and how money will flow. These answers come from the **objectives** and the facts the company prepared.

| The bank asks | Your answer |
|---|---|
| What is the primary business activity? | {business_categories} |
| Why does the company need a bank account? | {account_purpose} |
| Projected monthly inflows and outflows? | {monthly_volume} |
| Where are the main clients? | {clients_location} |
| Where are the main suppliers? | {suppliers_location} |
| What is the source of funds? | {source_of_funds} |
| Actual place of business? | {business_address} |
| Has the company commenced operations? | {operations_status} |

**Tips**
- Describe the business in one or two short sentences that match the registered objectives.
- The projected figures must be plausible for the size of the business and the registered capital.`,
      },
      zh: {
        title: '银行会问什么（3/5）：业务与经营',
        body: `银行必须了解公司做什么、资金如何进出。这部分答案来自 **经营目的** 和公司事先准备的信息。

| 银行的问题 | 您的答案 |
|---|---|
| 公司主要从事什么业务？ | {business_categories} |
| 公司为什么需要开设银行账户？ | {account_purpose} |
| 预计每月资金进出金额？ | {monthly_volume} |
| 主要客户来自哪里？ | {clients_location} |
| 主要供应商来自哪里？ | {suppliers_location} |
| 资金来源是什么？ | {source_of_funds} |
| 实际经营地址？ | {business_address} |
| 公司是否已经开始经营？ | {operations_status} |

**要点**
- 用一两句话说明业务，并与注册的经营目的一致。
- 预计金额要与业务规模和注册资本相称。`,
      },
    },
  },
  {
    contentKey: 'bank-interview-4-role',
    sortOrder: 40,
    conceptGroup: 'personal',
    localizations: {
      th: {
        title: 'ข้อมูลบริษัทที่ธนาคารจะถาม (4/5): บทบาทของคุณ',
        body: `ธนาคารจะถามถึงตัวคุณเองในฐานะกรรมการ/ผู้ถือหุ้น ต้องตอบได้ทันทีโดยไม่ลังเล

| คำถามที่ธนาคารถาม | คำตอบของคุณ |
|---|---|
| คุณชื่ออะไร (ตามเอกสาร) | {my_name} |
| คุณดำรงตำแหน่งอะไรในบริษัท | {my_position} |
| คุณรับผิดชอบงานด้านใด | {my_responsibilities} |
| อำนาจลงนามของบริษัท | {signing_authority} |
| คุณถือหุ้นเท่าใด | {my_shares} หุ้น ({my_share_percent}%) |

**เคล็ดลับ**
- ชื่อของคุณต้องตรงกับที่ปรากฏในหนังสือรับรองและบัญชีรายชื่อผู้ถือหุ้น
- อธิบายหน้าที่ประจำวันสั้น ๆ เช่น ดูแลลูกค้า ติดต่อซัพพลายเออร์ อนุมัติการชำระเงิน`,
      },
      en: {
        title: 'What the bank will ask (4/5): your role',
        body: `The bank will ask about you as a director/shareholder. You must answer immediately and without hesitation.

| The bank asks | Your answer |
|---|---|
| Your name (as in the documents) | {my_name} |
| What position do you hold? | {my_position} |
| What are your main responsibilities? | {my_responsibilities} |
| Who can sign for the company? | {signing_authority} |
| How many shares do you hold? | {my_shares} shares ({my_share_percent}%) |

**Tips**
- Your name must match the certificate and the shareholder list exactly.
- Describe your day-to-day duties briefly — e.g. customers, suppliers, approving payments.`,
      },
      zh: {
        title: '银行会问什么（4/5）：您的角色',
        body: `银行会询问您作为董事/股东的情况。必须立即、不犹豫地回答。

| 银行的问题 | 您的答案 |
|---|---|
| 您的姓名（按文件） | {my_name} |
| 您在公司担任什么职位？ | {my_position} |
| 您主要负责什么工作？ | {my_responsibilities} |
| 公司的签字权 | {signing_authority} |
| 您持有多少股份？ | {my_shares} 股（{my_share_percent}%） |

**要点**
- 您的姓名必须与注册证明和股东名册完全一致。
- 简要说明日常职责，例如：客户、供应商、审批付款。`,
      },
    },
  },
  {
    contentKey: 'bank-interview-5-tips',
    sortOrder: 50,
    conceptGroup: null,
    localizations: {
      th: {
        title: 'ข้อมูลบริษัทที่ธนาคารจะถาม (5/5): วิธีตอบให้ผ่าน',
        body: `**ก่อนโทร / ก่อนไปธนาคาร**
1. อ่านการ์ด 1–4 อีกครั้ง และเปิดหนังสือรับรองไว้ตรงหน้า
2. ทำแบบทดสอบประเมินจนได้คะแนนเต็ม แล้วจึงสอบ
3. ฝึกโทรกับเจ้าหน้าที่จำลองในระบบอย่างน้อย 1 ครั้ง

**ระหว่างตอบ**
- ฟังคำถามให้จบ ตอบสั้นและตรงประเด็น อย่าให้ข้อมูลเกินที่ถาม
- ถ้าไม่ได้ยินหรือไม่เข้าใจ ขอให้ถามซ้ำได้ ("ขอโทษค่ะ/ครับ รบกวนถามอีกครั้งได้ไหม")
- ตัวเลข (ทุน, หุ้น, วันที่) ต้องตรงกับเอกสารเท่านั้น — ห้ามเดา
- คำถามเรื่องธุรกิจและเงิน ให้ตอบตามข้อมูลที่บริษัทเตรียมไว้อย่างมั่นใจ

**สิ่งที่ห้ามทำ**
- ห้ามบอกว่าไม่รู้ข้อมูลพื้นฐานของบริษัทตัวเอง
- ห้ามอ่านจากกระดาษจนฟังดูเหมือนท่องจำ — ใช้ภาษาพูดของคุณเอง`,
      },
      en: {
        title: 'What the bank will ask (5/5): how to answer well',
        body: `**Before the call / the branch visit**
1. Re-read cards 1–4 with the certificate in front of you.
2. Repeat the evaluation quiz until you score full marks, then take the exam.
3. Do at least one practice call with the simulated officer.

**While answering**
- Let the officer finish the question; answer briefly and to the point; don't volunteer extra details.
- If you didn't hear or understand, ask them to repeat — that is normal.
- Numbers (capital, shares, dates) must match the documents exactly — never guess.
- Business and money questions: answer confidently with the facts the company prepared.

**Never**
- Say you don't know basic facts about your own company.
- Read from a sheet so that it sounds memorised — use your own words.`,
      },
      zh: {
        title: '银行会问什么（5/5）：如何顺利回答',
        body: `**通话前 / 去银行前**
1. 再读一遍第 1–4 张卡，并把注册证明放在面前。
2. 反复做评估测验直到满分，再参加考试。
3. 至少做一次模拟通话练习。

**回答时**
- 听完问题再回答；简短、切题；不要主动提供多余信息。
- 没听清或不理解可以请对方重复——这很正常。
- 数字（资本、股份、日期）必须与文件完全一致——不要猜。
- 业务和资金问题：按公司准备好的信息自信作答。

**切忌**
- 说不知道自己公司的基本信息。
- 照着纸念、听起来像背书——用自己的话说。`,
      },
    },
  },
];

/** The concept group a starter card teaches — the study page retrieves evidence for it. */
export function cardConceptGroup(contentKey: string): ConceptGroup | null {
  return BANK_INTERVIEW_CARDS.find((c) => c.contentKey === contentKey)?.conceptGroup ?? null;
}
