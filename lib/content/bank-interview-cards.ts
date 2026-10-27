import type { ConceptGroup } from '@/lib/domain/bank-interview';
import type { ExistingContentLocale } from '@/i18n/routing';

export const STUDY_LANGUAGES = ['th', 'en', 'zh', 'ms', 'ta'] as const;
export type StudyLanguage = (typeof STUDY_LANGUAGES)[number];

export type StarterCard<L extends StudyLanguage = ExistingContentLocale> = {
  contentKey: string;
  sortOrder: number;
  conceptGroup: ConceptGroup | null;
  localizations: Record<L, { title: string; body: string }>;
};

/**
 * Five direct cheat sheets covering every assessed concept. The optional customer channel text
 * is rendered by locale, so a company without a website never gets an empty website label.
 */
export const BANK_INTERVIEW_CARDS: StarterCard<StudyLanguage>[] = [
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
| Full registered name | **{company_name_th}** |
| 13-digit registration number | {juristic_id} |
| Registration date | {registered_on} |
| Registered address | {head_office_address} |
| Directors | {directors_count} — {directors} |
| Who can sign for the company | {signing_authority} |

**The bank may ask:** What is the full registered name? What are the registration number and date? Where is the company registered? Who are the directors? What is the position of the person who can sign? Answer: director.

**Remember:** use the full name and exact numbers from the documents. The registered address can differ from the real place of business.`,
      },
      th: {
        title: 'ข้อมูลบริษัทและกรรมการ (1/5)',
        body: `จำข้อมูลต่อไปนี้ให้ตรงกับเอกสารบริษัท

| สิ่งที่ต้องจำ | คำตอบของบริษัทคุณ |
|---|---|
| ชื่อเต็มที่จดทะเบียน | **{company_name_th}** |
| เลขทะเบียน 13 หลัก | {juristic_id} |
| วันที่จดทะเบียน | {registered_on} |
| ที่อยู่จดทะเบียน | {head_office_address} |
| กรรมการ | {directors_count} คน — {directors} |
| ผู้มีอำนาจลงนาม | {signing_authority} |

**ธนาคารอาจถาม:** ชื่อเต็ม เลขทะเบียน วันที่จดทะเบียน ที่อยู่ และกรรมการคือใคร ผู้ที่มีอำนาจลงนามมีตำแหน่งอะไร ตอบ: กรรมการ

**จำไว้:** ชื่อและตัวเลขต้องตรงเอกสาร ที่อยู่จดทะเบียนอาจไม่ใช่สถานที่ทำธุรกิจจริง`,
      },
      zh: {
        title: '公司身份和董事（1/5）',
        body: `请准确记住公司文件中的以下信息。

| 要记住的内容 | 您公司的答案 |
|---|---|
| 完整注册名称 | **{company_name_th}** |
| 13 位注册号 | {juristic_id} |
| 注册日期 | {registered_on} |
| 注册地址 | {head_office_address} |
| 董事 | {directors_count} 位 — {directors} |
| 有权代表公司签字的人 | {signing_authority} |

**银行可能会问：** 完整名称、注册号、注册日期、注册地址和董事是谁？有权签字的人担任什么职位？回答：董事。

**记住：** 名称和数字必须与文件一致。注册地址可能与实际经营地点不同。`,
      },
      ms: {
        title: 'Identiti syarikat dan pengarah (1/5)',
        body: `Hafal maklumat ini tepat seperti dalam dokumen syarikat.

| Perkara yang perlu diingat | Jawapan syarikat anda |
|---|---|
| Nama berdaftar penuh | **{company_name_th}** |
| Nombor pendaftaran 13 digit | {juristic_id} |
| Tarikh pendaftaran | {registered_on} |
| Alamat berdaftar | {head_office_address} |
| Pengarah | {directors_count} orang — {directors} |
| Syarat menandatangani bagi pihak syarikat | {signing_authority} |

**Soalan yang mungkin ditanya oleh pegawai bank:** Apakah nama berdaftar penuh, nombor dan tarikh pendaftaran, serta alamat berdaftar? Siapakah pengarah? Apakah jawatan orang yang boleh menandatangani bagi pihak syarikat?

**Ingat:** Jawapan ringkas tentang jawatan penandatangan ialah pengarah. Untuk urusan sebenar, ikut syarat tandatangan dan cop seperti dalam dokumen. Nama dan nombor mesti tepat; alamat berdaftar mungkin berbeza daripada lokasi perniagaan sebenar.`,
      },
      ta: {
        title: 'நிறுவன அடையாளமும் இயக்குநர்களும் (1/5)',
        body: `நிறுவன ஆவணங்களில் உள்ளபடியே இந்த விவரங்களை நினைவில் கொள்ளுங்கள்.

| நினைவில் கொள்ள வேண்டியது | உங்கள் நிறுவனத்தின் பதில் |
|---|---|
| முழு பதிவு செய்யப்பட்ட பெயர் | **{company_name_th}** |
| 13 இலக்க பதிவெண் | {juristic_id} |
| பதிவு செய்யப்பட்ட திகதி | {registered_on} |
| பதிவு செய்யப்பட்ட முகவரி | {head_office_address} |
| இயக்குநர்கள் | {directors_count} பேர் — {directors} |
| நிறுவனத்தின் சார்பில் கையொப்பமிடும் நிபந்தனை | {signing_authority} |

**வங்கியாளர் கேட்கக்கூடும் கேள்விகள்:** நிறுவனத்தின் முழுப் பெயர், பதிவெண், பதிவு செய்யப்பட்ட திகதி, முகவரி, இயக்குநர்கள் யார்? நிறுவனத்தின் சார்பில் கையொப்பமிடுபவரின் பதவி என்ன?

**நினைவில் கொள்க:** பதவி பற்றிய சுருக்கமான பதில் இயக்குநர். உண்மையான ஆவணங்களில் உள்ள கையொப்பம் மற்றும் முத்திரை நிபந்தனையைப் பின்பற்றுங்கள். பெயர்களும் எண்களும் ஆவணங்களுடன் பொருந்த வேண்டும்; பதிவு முகவரி வணிகம் நடைபெறும் இடத்திலிருந்து வேறுபடலாம்.`,
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
| How many shares do you hold? | {my_shares} shares ({my_share_percent}%) |
| Total shares | {total_shares} shares |
| Value per share | {par_value} Baht |
| Shareholders | {shareholders_count} — {shareholders} |
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
| คุณถือหุ้นกี่หุ้น? | {my_shares} หุ้น ({my_share_percent}%) |
| จำนวนหุ้นทั้งหมด | {total_shares} หุ้น |
| มูลค่าต่อหุ้น | {par_value} บาท |
| ผู้ถือหุ้น | {shareholders_count} คน — {shareholders} |
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
| 您持有多少股？ | {my_shares} 股（{my_share_percent}%） |
| 总股份 | {total_shares} 股 |
| 每股价值 | {par_value} 泰铢 |
| 股东 | {shareholders_count} 位 — {shareholders} |
| 您的姓名和职位 | {my_name} — {my_position} |
| 您的日常职责 | {my_responsibilities} |
| 与其他股东的关系 | {my_relationship} |

**银行可能会问：** 资本是多少？有几位股东？您有多少股份？职位和日常工作是什么？

**记住：** 注册资本 ÷ 每股价值 = 总股份。可用自己的话说明工作，但事实必须一致。`,
      },
      ms: {
        title: 'Modal, pemegang saham dan peranan anda (2/5)',
        body: `Ketahui siapa yang memiliki syarikat dan tugas anda di dalamnya.

| Perkara yang perlu diingat | Jawapan anda |
|---|---|
| Modal berdaftar | {registered_capital} baht |
| Berapa saham yang anda pegang? | {my_shares} saham ({my_share_percent}%) |
| Jumlah saham | {total_shares} saham |
| Nilai sesaham | {par_value} baht |
| Pemegang saham | {shareholders_count} orang — {shareholders} |
| Nama dan jawatan anda | {my_name} — {my_position} |
| Tugas harian anda | {my_responsibilities} |
| Hubungan dengan pemegang saham lain | {my_relationship} |

**Soalan yang mungkin ditanya oleh pegawai bank:** Berapakah modal syarikat? Berapa orang pemegang saham? Berapa saham yang anda miliki? Apakah jawatan dan tugas harian anda?

**Ingat:** Modal berdaftar ÷ nilai sesaham = jumlah saham. Terangkan tugas dengan kata-kata sendiri, tetapi pastikan fakta konsisten.`,
      },
      ta: {
        title: 'மூலதனம், பங்குதாரர்கள் மற்றும் உங்கள் பங்கு (2/5)',
        body: `நிறுவனத்தின் உரிமையாளர்கள் யார், அதில் நீங்கள் என்ன செய்கிறீர்கள் என்பதை அறிந்திருங்கள்.

| நினைவில் கொள்ள வேண்டியது | உங்கள் பதில் |
|---|---|
| பதிவு செய்யப்பட்ட மூலதனம் | {registered_capital} பாட் |
| உங்களிடம் எத்தனை பங்குகள் உள்ளன? | {my_shares} பங்குகள் ({my_share_percent}%) |
| மொத்தப் பங்குகள் | {total_shares} பங்குகள் |
| ஒரு பங்கின் மதிப்பு | {par_value} பாட் |
| பங்குதாரர்கள் | {shareholders_count} பேர் — {shareholders} |
| உங்கள் பெயரும் பதவியும் | {my_name} — {my_position} |
| உங்கள் அன்றாடப் பொறுப்புகள் | {my_responsibilities} |
| மற்ற பங்குதாரர்களுடனான உறவு | {my_relationship} |

**வங்கியாளர் கேட்கக்கூடும் கேள்விகள்:** நிறுவனத்தின் மூலதனம் எவ்வளவு? எத்தனை பங்குதாரர்கள் உள்ளனர்? உங்களிடம் எத்தனை பங்குகள் உள்ளன? உங்கள் பதவியும் அன்றாடப் பணியும் என்ன?

**நினைவில் கொள்க:** பதிவு செய்யப்பட்ட மூலதனம் ÷ ஒரு பங்கின் மதிப்பு = மொத்தப் பங்குகள். உங்கள் பணியைச் சொந்த வார்த்தைகளில் விளக்கலாம்; உண்மைகள் மாறக்கூடாது.`,
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
| The Company’s Business Activities | {nature_of_business} |
| Products or services | {products_services} |
| Why the company was established | {business_purpose} |
| Main customers | {main_clients} |
| How the company finds customers | {customer_channels} |
| Main suppliers | {main_suppliers} — {suppliers_location} |
| Actual place of business | {business_address} |
| Registered business categories | {business_categories} |
| Has business started? | {operations_status} |

**The bank will ask:** What business does the company do? What are its main products or services? How do you find your customers? For the last question, name one real channel. You do not need to list everything.

**Remember:** the real business must make sense with the registered objectives. If there is no website, do not mention one.`,
      },
      th: {
        title: 'ธุรกิจ ลูกค้า และซัพพลายเออร์ (3/5)',
        body: `อธิบายธุรกิจจริงให้จบใน 1–2 ประโยคง่าย ๆ

| สิ่งที่ต้องจำ | คำตอบของบริษัทคุณ |
|---|---|
| ลักษณะการดำเนินธุรกิจของบริษัท | {nature_of_business} |
| สินค้าหรือบริการ | {products_services} |
| เหตุผลที่จัดตั้งบริษัท | {business_purpose} |
| ลูกค้าหลัก | {main_clients} |
| วิธีหาลูกค้า | {customer_channels} |
| ซัพพลายเออร์หลัก | {main_suppliers} — {suppliers_location} |
| สถานที่ทำธุรกิจจริง | {business_address} |
| ประเภทธุรกิจที่จดทะเบียน | {business_categories} |
| เริ่มทำธุรกิจแล้วหรือยัง | {operations_status} |

**ธนาคารจะถาม:** บริษัททำธุรกิจอะไร ขายสินค้าหรือบริการหลักอะไร บริษัทหาลูกค้าอย่างไรคะ สำหรับคำถามสุดท้าย บอกวิธีหาลูกค้าจริงเพียงหนึ่งช่องทางก็พอ ไม่ต้องบอกทุกช่องทาง

**จำไว้:** ธุรกิจจริงต้องสอดคล้องกับวัตถุประสงค์ ถ้าไม่มีเว็บไซต์ ไม่ต้องพูดถึงเว็บไซต์`,
      },
      zh: {
        title: '业务、客户和供应商（3/5）',
        body: `用一两句简单的话说明公司的实际业务。

| 要记住的内容 | 您公司的答案 |
|---|---|
| 公司的主要业务 | {nature_of_business} |
| 产品或服务 | {products_services} |
| 公司成立的目的 | {business_purpose} |
| 主要客户 | {main_clients} |
| 如何寻找客户 | {customer_channels} |
| 主要供应商 | {main_suppliers} — {suppliers_location} |
| 实际经营地点 | {business_address} |
| 注册业务类别 | {business_categories} |
| 是否已开始经营 | {operations_status} |

**银行会问：** 公司做什么业务？主要销售什么？公司如何寻找客户？最后一个问题只需说出一个真实的获客渠道，不必列出全部。

**记住：** 实际业务应与注册目的相符。没有网站时，不要提到网站。`,
      },
      ms: {
        title: 'Perniagaan, pelanggan dan pembekal (3/5)',
        body: `Terangkan perniagaan sebenar dalam satu atau dua ayat yang mudah.

| Perkara yang perlu diingat | Jawapan syarikat anda |
|---|---|
| Aktiviti Perniagaan Syarikat | {nature_of_business} |
| Produk atau perkhidmatan | {products_services} |
| Tujuan syarikat ditubuhkan | {business_purpose} |
| Pelanggan utama | {main_clients} |
| Cara syarikat mencari pelanggan | {customer_channels} |
| Pembekal utama | {main_suppliers} — {suppliers_location} |
| Lokasi perniagaan sebenar | {business_address} |
| Kategori perniagaan berdaftar | {business_categories} |
| Adakah perniagaan sudah bermula? | {operations_status} |

**Soalan yang mungkin ditanya oleh pegawai bank:** Apakah perniagaan syarikat? Apakah produk atau perkhidmatan utama? Bagaimana syarikat mencari pelanggan? Untuk soalan terakhir, sebut satu saluran sebenar sahaja; tidak perlu menyenaraikan semuanya.

**Ingat:** Aktiviti sebenar mesti sepadan dengan objektif berdaftar. Jika tiada laman web, jangan sebut laman web.`,
      },
      ta: {
        title: 'வணிகம், வாடிக்கையாளர்கள் மற்றும் வழங்குநர்கள் (3/5)',
        body: `நிறுவனத்தின் உண்மையான வணிகத்தை ஒன்று அல்லது இரண்டு எளிய வாக்கியங்களில் விளக்குங்கள்.

| நினைவில் கொள்ள வேண்டியது | உங்கள் நிறுவனத்தின் பதில் |
|---|---|
| நிறுவனத்தின் வணிகச் செயல்பாடுகள் | {nature_of_business} |
| பொருட்கள் அல்லது சேவைகள் | {products_services} |
| நிறுவனம் தொடங்கப்பட்ட நோக்கம் | {business_purpose} |
| முக்கிய வாடிக்கையாளர்கள் | {main_clients} |
| வாடிக்கையாளர்களை எப்படிப் பெறுகிறீர்கள் | {customer_channels} |
| முக்கிய வழங்குநர்கள் | {main_suppliers} — {suppliers_location} |
| வணிகம் நடைபெறும் இடம் | {business_address} |
| பதிவு செய்யப்பட்ட வணிக வகைகள் | {business_categories} |
| வணிகம் தொடங்கிவிட்டதா? | {operations_status} |

**வங்கியாளர் கேட்கக்கூடும் கேள்விகள்:** நிறுவனம் என்ன வணிகம் செய்கிறது? முக்கியப் பொருட்கள் அல்லது சேவைகள் யாவை? வாடிக்கையாளர்களை எப்படி அடைகிறது? கடைசிக் கேள்விக்கு உண்மையான ஒரு வழியை மட்டும் சொன்னால் போதும்.

**நினைவில் கொள்க:** உண்மையான வணிகம் பதிவு செய்யப்பட்ட நோக்கங்களுடன் பொருந்த வேண்டும். இணையதளம் இல்லையெனில் அதைச் சொல்ல வேண்டாம்.`,
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
        body: `Learn these three estimates from your company's approved business category. They are not calculated from invoices.

| What to remember | Your company answer |
|---|---|
| Estimated monthly revenue | {monthly_revenue} |
| Average amount per transaction | {average_transaction} |
| Estimated transactions per month | {monthly_transactions} |
| Expected monthly money movement | {monthly_volume} |
| Start-up source of funds | {source_of_funds} |
| First money entering the account | {first_incoming_funds} |
| Why the account is needed | {account_purpose} |
| Why PromptPay or QR is needed | {promptpay_qr_purpose} |
| Expected transaction pattern | {transaction_details} |

**The bank will ask:**
1. Tell me about the company's estimated monthly revenue. Answer: **{monthly_revenue}**.
2. Tell me about the company's estimated total number of transactions per month. Answer: **{monthly_transactions}**.
3. Tell me about the company's estimated average transaction amount. Answer: **{average_transaction}**.

**Remember:** these are estimates for your company's business category. Say the approximate figure; a small difference is okay.`,
      },
      th: {
        title: 'เงินและธุรกรรม (4/5)',
        body: `จำตัวเลขประมาณการ 3 อย่างตามประเภทธุรกิจที่อนุมัติของบริษัท ไม่ได้คำนวณจากใบแจ้งหนี้

| สิ่งที่ต้องจำ | คำตอบของบริษัทคุณ |
|---|---|
| รายได้ต่อเดือนโดยประมาณ | {monthly_revenue} |
| ยอดเฉลี่ยต่อธุรกรรม | {average_transaction} |
| จำนวนธุรกรรมต่อเดือน | {monthly_transactions} |
| เงินเข้าออกต่อเดือนที่คาดไว้ | {monthly_volume} |
| แหล่งเงินเริ่มต้น | {source_of_funds} |
| เงินก้อนแรกที่จะเข้าบัญชี | {first_incoming_funds} |
| เหตุผลที่ต้องมีบัญชี | {account_purpose} |
| เหตุผลที่ใช้พร้อมเพย์หรือ QR | {promptpay_qr_purpose} |
| รูปแบบธุรกรรมที่คาดไว้ | {transaction_details} |

**ธนาคารจะถาม:**
1. รายได้ต่อเดือนโดยประมาณของบริษัทเท่าไร ตอบ: **{monthly_revenue}**
2. บริษัทมีธุรกรรมทั้งหมดประมาณกี่รายการต่อเดือน ตอบ: **{monthly_transactions}**
3. ยอดเงินเฉลี่ยต่อธุรกรรมประมาณเท่าไร ตอบ: **{average_transaction}**

**จำไว้:** เป็นตัวเลขประมาณการตามประเภทธุรกิจ ตอบเป็นตัวเลขใกล้เคียงได้`,
      },
      zh: {
        title: '资金和交易（4/5）',
        body: `记住公司已批准业务类别的三项估算数字；它们不是根据发票计算的。

| 要记住的内容 | 您公司的答案 |
|---|---|
| 预计月收入 | {monthly_revenue} |
| 平均每笔交易金额 | {average_transaction} |
| 预计每月交易数量 | {monthly_transactions} |
| 预计每月资金进出 | {monthly_volume} |
| 启动资金来源 | {source_of_funds} |
| 首笔进入账户的资金 | {first_incoming_funds} |
| 开户目的 | {account_purpose} |
| 使用 PromptPay 或二维码的原因 | {promptpay_qr_purpose} |
| 预计交易情况 | {transaction_details} |

**银行会问：**
1. 公司预计每月收入是多少？回答：**{monthly_revenue}**。
2. 公司预计每月有多少笔交易？回答：**{monthly_transactions}**。
3. 公司平均每笔交易金额是多少？回答：**{average_transaction}**。

**记住：** 这些是按业务类别确定的估算数字，可以回答接近的金额。`,
      },
      ms: {
        title: 'Wang dan transaksi (4/5)',
        body: `Hafal tiga anggaran berdasarkan kategori perniagaan syarikat yang diluluskan. Angka ini bukan dikira daripada invois.

| Perkara yang perlu diingat | Jawapan syarikat anda |
|---|---|
| Anggaran hasil bulanan | {monthly_revenue} |
| Purata amaun setiap transaksi | {average_transaction} |
| Anggaran bilangan transaksi sebulan | {monthly_transactions} |
| Anggaran aliran wang bulanan | {monthly_volume} |
| Sumber modal permulaan | {source_of_funds} |
| Wang pertama yang masuk ke akaun | {first_incoming_funds} |
| Tujuan akaun diperlukan | {account_purpose} |
| Sebab memerlukan PromptPay atau QR | {promptpay_qr_purpose} |
| Corak transaksi yang dijangka | {transaction_details} |

**Soalan yang mungkin ditanya oleh pegawai bank:**
1. Berapakah anggaran hasil bulanan syarikat? Jawapan: **{monthly_revenue}**.
2. Berapakah anggaran jumlah transaksi sebulan? Jawapan: **{monthly_transactions}**.
3. Berapakah anggaran purata amaun setiap transaksi? Jawapan: **{average_transaction}**.

**Ingat:** Ini anggaran mengikut kategori perniagaan. Nyatakan angka lebih kurang; sedikit perbezaan tidak mengapa.`,
      },
      ta: {
        title: 'பணமும் பரிவர்த்தனைகளும் (4/5)',
        body: `அங்கீகரிக்கப்பட்ட வணிக வகையின் அடிப்படையில் உள்ள இந்த மூன்று மதிப்பீடுகளை நினைவில் கொள்ளுங்கள். அவை விலைப்பட்டியல்களிலிருந்து கணக்கிடப்படவில்லை.

| நினைவில் கொள்ள வேண்டியது | உங்கள் நிறுவனத்தின் பதில் |
|---|---|
| மதிப்பிடப்பட்ட மாத வருவாய் | {monthly_revenue} |
| ஒரு பரிவர்த்தனைக்கான சராசரித் தொகை | {average_transaction} |
| மாதத்திற்கு மதிப்பிடப்பட்ட பரிவர்த்தனைகள் | {monthly_transactions} |
| மாதாந்திர பணப் போக்குவரத்து | {monthly_volume} |
| தொடக்க நிதியின் மூலம் | {source_of_funds} |
| கணக்கில் முதலில் வரும் பணம் | {first_incoming_funds} |
| வங்கிக் கணக்கு ஏன் தேவை | {account_purpose} |
| PromptPay அல்லது QR ஏன் தேவை | {promptpay_qr_purpose} |
| எதிர்பார்க்கப்படும் பரிவர்த்தனை முறை | {transaction_details} |

**வங்கியாளர் கேட்கக்கூடும் கேள்விகள்:**
1. நிறுவனத்தின் மதிப்பிடப்பட்ட மாத வருவாய் எவ்வளவு? பதில்: **{monthly_revenue}**.
2. மாதத்திற்கு மதிப்பிடப்பட்ட மொத்தப் பரிவர்த்தனைகள் எத்தனை? பதில்: **{monthly_transactions}**.
3. ஒரு பரிவர்த்தனைக்கான சராசரித் தொகை எவ்வளவு? பதில்: **{average_transaction}**.

**நினைவில் கொள்க:** இவை வணிக வகையை அடிப்படையாகக் கொண்ட மதிப்பீடுகள். தோராயமான தொகையைக் கூறலாம்.`,
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
      ms: {
        title: 'Keselamatan bank dan jawapan yakin (5/5)',
        body: `Gunakan jawapan yang selamat dan mudah.

| Soalan yang mungkin ditanya oleh pegawai bank | Jawapan yang baik |
|---|---|
| Siapa mengawal perbankan internet? | Pengarah syarikat yang diberi kuasa mengawalnya. |
| Siapa menyimpan telefon untuk menerima OTP? | Orang yang diberi kuasa menyimpan dan mengawalnya. |
| Bagaimana anda menerangkan pindahan wang? | Nyatakan siapa membayar siapa, sebabnya, jumlah dan tarikh. |
| Dokumen apa yang menyokong bayaran? | Invois, perjanjian, resit atau dokumen perniagaan yang sepadan. |
| Bagaimana jika bank menyemak? | Pastikan semua jawapan selaras dengan dokumen dan aktiviti sebenar. |

**Jawab dalam empat langkah:** dengar soalan sampai habis; beri jawapan terus dahulu; tambah satu penjelasan ringkas jika perlu; minta pegawai ulangi jika tidak pasti—jangan meneka.

Tidak perlu menggunakan perkataan yang sukar. Jawapan yang jelas, jujur dan konsisten sudah memadai.`,
      },
      ta: {
        title: 'வங்கிப் பாதுகாப்பும் நம்பிக்கையான பதில்களும் (5/5)',
        body: `பாதுகாப்பான, எளிய பதில்களைப் பயன்படுத்துங்கள்.

| வங்கியாளர் கேட்கக்கூடும் கேள்விகள் | நல்ல பதில் |
|---|---|
| இணைய வங்கியை யார் கட்டுப்படுத்துகிறார்கள்? | அங்கீகரிக்கப்பட்ட நிறுவன இயக்குநர் கட்டுப்படுத்துகிறார். |
| OTP பெறும் தொலைபேசி யாரிடம் இருக்கும்? | அங்கீகரிக்கப்பட்ட நபர் அதை வைத்துக் கட்டுப்படுத்துகிறார். |
| பணப் பரிமாற்றத்தை எப்படி விளக்குவீர்கள்? | யார் யாருக்குப் பணம் செலுத்தினார், ஏன், தொகை மற்றும் திகதி ஆகியவற்றைக் கூறுங்கள். |
| பணம் செலுத்தியதற்கான ஆதாரம் என்ன? | விலைப்பட்டியல், ஒப்பந்தம், ரசீது அல்லது பொருந்தும் வணிக ஆவணம். |
| வங்கி சரிபார்த்தால் என்ன செய்வீர்கள்? | எல்லாப் பதில்களும் ஆவணங்களுக்கும் உண்மையான செயல்பாட்டுக்கும் பொருந்தட்டும். |

**நான்கு படிகளில் பதிலளியுங்கள்:** கேள்வியை முழுவதும் கேளுங்கள்; நேரடியாகப் பதில் சொல்லுங்கள்; தேவைப்பட்டால் சிறிய விளக்கம் சேர்க்கவும்; புரியாவிட்டால் மீண்டும் கேட்கச் சொல்லுங்கள்—ஊகிக்க வேண்டாம்.

கடினமான சொற்கள் தேவையில்லை. தெளிவான, உண்மையான, சீரான பதில்கள் போதும்.`,
      },
    },
  },
];

export function cardConceptGroup(contentKey: string): ConceptGroup | null {
  return BANK_INTERVIEW_CARDS.find((card) => card.contentKey === contentKey)?.conceptGroup ?? null;
}
