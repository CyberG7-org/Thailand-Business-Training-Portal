import type { Assessment, ConceptId, InterviewPlan, PlanItem } from './types';

export type BinaryReadinessVerdict = 'correct' | 'wrong';

const LOCAL_DIGITS = /[๐-๙௦-௯０-９]/g;
const POLITE_ENDING = /(ครับ|ค่ะ|คะ|นะครับ|นะคะ)+$/;
const EVASIVE = /ไม่ทราบ|ไม่รู้|ไม่แน่ใจ|จำไม่ได้/;

const arabicDigits = (value: string) =>
  value.replace(LOCAL_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    const zero = code >= 0xff10 ? 0xff10 : code >= 0x0be6 ? 0x0be6 : 0x0e50;
    return String(code - zero);
  });

const compact = (value: string) =>
  arabicDigits(value)
    .normalize('NFC')
    .toLowerCase()
    .replace(POLITE_ENDING, '')
    .replace(/[\s,.;:()\[\]{}'"“”‘’/\\_-]/g, '');

const numbers = (value: string) =>
  (arabicDigits(value).match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((part) => Number(part.replaceAll(',', '')))
    .filter((number) => Number.isFinite(number));

const firstAmount = (value: string): number | undefined => {
  const plain = arabicDigits(value);
  const match = /\d[\d,]*(?:\.\d+)?/.exec(plain);
  if (!match) return undefined;
  const amount = Number(match[0].replaceAll(',', ''));
  const suffix = plain
    .slice(match.index + match[0].length)
    .trimStart()
    .toLowerCase();
  const multiplier = /^(ล้าน|million\b|juta\b|மில்லியன்|m\b)/.test(suffix)
    ? 1_000_000
    : /^(แสน)/.test(suffix)
      ? 100_000
      : /^(หมื่น)/.test(suffix)
        ? 10_000
        : /^(พัน|thousand\b|ribu\b|ஆயிரம்|k\b)/.test(suffix)
          ? 1_000
          : 1;
  return amount * multiplier;
};

const withinTwentyPercent = (answer: string, expected: string) => {
  const actual = firstAmount(answer);
  const target = firstAmount(expected);
  return actual !== undefined && target !== undefined && Math.abs(actual - target) <= target * 0.2;
};

function longestCommonRun(a: string, b: string): number {
  const row = new Array<number>(b.length + 1).fill(0);
  let longest = 0;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = b.length; j >= 1; j -= 1) {
      row[j] = a[i - 1] === b[j - 1] ? row[j - 1] + 1 : 0;
      longest = Math.max(longest, row[j]);
    }
  }
  return longest;
}

const looseMeaning = (answer: string, expected: string) => {
  const actual = compact(answer);
  const target = compact(expected);
  if (actual.length < 3 || target.length < 3) return false;
  return (
    target.includes(actual) || actual.includes(target) || longestCommonRun(actual, target) >= 4
  );
};

const businessMeaning = (answer: string, expected: string) => {
  const stripGeneric = (value: string) =>
    value.replace(
      /บริษัท|ธุรกิจ|ผลิตภัณฑ์|สินค้า|บริการ|จำหน่าย|ขาย|ทำ|menjual|jual|perniagaan|syarikat|produk|perkhidmatan|sell(?:ing)?|business|company|products?|services?|விற்க|விற்பனை|நிறுவன|பொருட்கள்|சேவைகள்|销售|公司|业务|产品|服务/gi,
      '',
    );
  return looseMeaning(stripGeneric(answer), stripGeneric(expected));
};

const addressMatches = (answer: string, expected: string) => {
  const postcode = /\b\d{5}\b/.exec(arabicDigits(expected))?.[0];
  const houseNumber = /^\s*(\d+(?:\/\d+)?)/.exec(arabicDigits(expected))?.[1];
  if (
    postcode &&
    houseNumber &&
    arabicDigits(answer).includes(postcode) &&
    arabicDigits(answer).includes(houseNumber)
  )
    return true;
  const target = compact(expected);
  const parts = arabicDigits(answer)
    .split(/[\s,./_-]+/)
    .map((part) =>
      compact(part).replace(/^(เลขที่|หมู่ที่|หมู่|ถนน|ซอย|แขวง|เขต|ตำบล|อำเภอ|จังหวัด)/, ''),
    )
    .filter((part) => part.length >= 2);
  return new Set(parts.filter((part) => target.includes(part))).size >= 2;
};

const directorMatches = (answer: string): boolean => {
  const actual = compact(answer);
  if (/ไม่ใช่กรรมการ|notadirector|bukanpengarah|不是董事|இயக்குநர்அல்ல/.test(actual)) return false;
  return /กรรมการ|director|pengarah|董事|இயக்குநர்/.test(actual);
};

const attendeeMatches = (answer: string, expected: string) => {
  const [name = ''] = expected.split(' / ');
  const withoutTitle = (value: string) => compact(value).replace(/^(นาย|นางสาว|นาง|ดร|คุณ)/, '');
  const actual = withoutTitle(answer);
  return (
    withoutTitle(name).length >= 2 && actual.includes(withoutTitle(name)) && directorMatches(answer)
  );
};

const dateMatches = (answer: string, expected: string) => {
  const monthNames = [
    ['มกราคม', 'ม.ค.', 'january', 'jan'],
    ['กุมภาพันธ์', 'ก.พ.', 'february', 'feb'],
    ['มีนาคม', 'มี.ค.', 'march', 'mar'],
    ['เมษายน', 'เม.ย.', 'april', 'apr'],
    ['พฤษภาคม', 'พ.ค.', 'may'],
    ['มิถุนายน', 'มิ.ย.', 'june', 'jun'],
    ['กรกฎาคม', 'ก.ค.', 'july', 'jul'],
    ['สิงหาคม', 'ส.ค.', 'august', 'aug'],
    ['กันยายน', 'ก.ย.', 'september', 'sep'],
    ['ตุลาคม', 'ต.ค.', 'october', 'oct'],
    ['พฤศจิกายน', 'พ.ย.', 'november', 'nov'],
    ['ธันวาคม', 'ธ.ค.', 'december', 'dec'],
  ];
  const extraMonthNames = [
    ['januari', 'ஜனவரி', '一月'],
    ['februari', 'பிப்ரவரி', '二月'],
    ['mac', 'மார்ச்', '三月'],
    ['april', 'ஏப்ரல்', '四月'],
    ['mei', 'மே', '五月'],
    ['jun', 'ஜூன்', '六月'],
    ['julai', 'ஜூலை', '七月'],
    ['ogos', 'ஆகஸ்ட்', '八月'],
    ['september', 'செப்டம்பர்', '九月'],
    ['oktober', 'அக்டோபர்', '十月'],
    ['november', 'நவம்பர்', '十一月'],
    ['disember', 'டிசம்பர்', '十二月'],
  ];
  const dateParts = (value: string) => {
    const numeric = arabicDigits(value).match(/\b(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
    if (numeric) {
      const yearFirst = numeric[1].length === 4;
      return {
        day: Number(yearFirst ? numeric[3] : numeric[1]),
        month: Number(numeric[2]),
        year: Number(yearFirst ? numeric[1] : numeric[3]),
      };
    }
    const values = numbers(value);
    const lower = value.toLowerCase();
    const index = monthNames.findIndex((aliases, month) =>
      [...aliases, ...extraMonthNames[month]].some((alias) =>
        /^[a-z]/.test(alias) ? new RegExp(`\\b${alias}\\b`).test(lower) : lower.includes(alias),
      ),
    );
    return {
      day: values.find((number) => number >= 1 && number <= 31),
      month: index < 0 ? null : index + 1,
      year: values.find((number) => number >= 1900),
    };
  };
  const target = dateParts(expected);
  const actual = dateParts(answer);
  if (!target.year || !actual.year || !target.day || !target.month) return false;
  const yearMatches =
    actual.year === target.year ||
    actual.year === target.year - 543 ||
    actual.year === target.year + 543;
  return yearMatches && target.day === actual.day && target.month === actual.month;
};

const accountPurposeMatches = (answer: string) => {
  const actual = compact(answer);
  const hasAny = (keywords: string[]) => keywords.some((keyword) => actual.includes(keyword));
  // Grade the two required ideas from keyword groups, not a memorized sentence. Latin stems
  // deliberately cover normal inflections such as receive/received/receiving and pay/paid/paying.
  const receives =
    hasAny(['รับ', 'receiv', 'collect', 'accept', 'terima', 'பெற', '收']) &&
    hasAny([
      'ลูกค้า',
      'ชำระ',
      'ยอดขาย',
      'customer',
      'client',
      'sale',
      'revenue',
      'payment',
      'pelanggan',
      'வாடிக்கையாள',
      '客户',
    ]);
  const pays =
    hasAny(['จ่าย', 'pay', 'paid', 'cover', 'settle', 'bayar', 'செலுத்த', '付']) &&
    hasAny([
      'ค่าใช้จ่าย',
      'บริษัท',
      'กิจการ',
      'ธุรกิจ',
      'ค่าเช่า',
      'ค่าสินค้า',
      'ค่าจ้าง',
      'เงินเดือน',
      'ค่าดำเนินการ',
      'expense',
      'cost',
      'bill',
      'supplier',
      'rent',
      'salary',
      'operation',
      'company',
      'business',
      'perbelanjaan',
      'syarikat',
      'செலவ',
      'நிறுவன',
      '费用',
      '公司',
    ]);
  return receives && pays;
};

const customerOriginMatches = (answer: string, expected: string) => {
  const actual = compact(answer);
  // Earlier frozen plans also include a customer profile; only the channel is relevant now.
  const separator = expected.lastIndexOf(' / ');
  const origin = separator < 0 ? expected : expected.slice(separator + 3);
  const originText = compact(origin);
  const channels = [
    ['facebook', 'เฟซบุ๊ก', '脸书', 'முகநூல்'],
    ['tiktok', 'ติ๊กต็อก', '抖音'],
    ['เว็บไซต์', 'website', 'laman web', 'இணையதளம்', '网站'],
    ['แนะนำ', 'บอกต่อ', 'referral', 'rujukan', 'cadangan', 'பரிந்துரை', '推荐'],
    ['หน้าร้าน', 'เข้ามาที่ร้าน', 'walkin', 'kedai', 'கடை', '门店'],
    ['social media', 'media sosial', 'சமூக ஊடகம்', '社交媒体'],
  ];
  const matchesGroup = (source: string, words: string[]) =>
    words.some((word) => source.includes(compact(word))) &&
    words.some((word) => actual.includes(compact(word)));
  return channels.some((words) => matchesGroup(originText, words));
};

/** One deterministic rubric for local testing and non-AI fallbacks. */
export function evaluateReadinessAnswer(
  item: PlanItem,
  answer: string,
  translatedExpected?: string,
  companyNameEn?: string | null,
): BinaryReadinessVerdict {
  if (answer.trim().length < 2 || EVASIVE.test(answer)) return 'wrong';
  const expected = item.expected;
  let correct = false;
  switch (item.concept) {
    case 'company_name':
      correct =
        compact(answer.replace(/\([^)]*[a-z][^)]*\)/gi, '')).endsWith(compact(expected)) ||
        Boolean(companyNameEn && compact(answer).includes(compact(companyNameEn)));
      break;
    case 'registration_number':
      correct =
        arabicDigits(answer).replace(/\D/g, '') === arabicDigits(expected).replace(/\D/g, '');
      break;
    case 'registered_address':
      correct = addressMatches(answer, expected);
      break;
    case 'actual_business':
    case 'products_services':
      correct =
        businessMeaning(answer, expected) ||
        Boolean(
          translatedExpected &&
          translatedExpected !== expected &&
          businessMeaning(answer, translatedExpected),
        );
      break;
    case 'authorized_representative':
      correct = directorMatches(answer);
      break;
    case 'attendee_identity':
      correct = attendeeMatches(answer, expected);
      break;
    case 'registration_date':
      correct = dateMatches(answer, expected);
      break;
    case 'account_purpose':
      correct = accountPurposeMatches(answer);
      break;
    case 'customer_origin':
      correct = customerOriginMatches(answer, expected);
      break;
    case 'monthly_revenue':
    case 'monthly_transactions':
    case 'average_transaction':
      correct = withinTwentyPercent(answer, expected);
      break;
    default:
      correct = looseMeaning(answer, expected);
  }
  return correct ? 'correct' : 'wrong';
}

const RUBRICS: Record<string, string> = {
  company_name:
    'ตอบชื่อบริษัทภาษาไทยที่จดทะเบียนครบถ้วน หรือชื่อภาษาอังกฤษที่บันทึกไว้ โดยไม่สนใจช่องว่างหรือเครื่องหมาย',
  registration_number: 'เลขทะเบียน 13 หลักต้องตรงกัน โดยไม่สนใจช่องว่างหรือขีด',
  registered_address:
    'ที่อยู่โดยรวมถูกต้อง ไม่ต้องครบทุกคำ; จังหวัดและส่วนสำคัญอีกหนึ่งส่วนก็เพียงพอ',
  actual_business: 'คำอธิบายสั้น ๆ ที่ตรงกับธุรกิจหลักก็เพียงพอ ไม่ต้องบอกทุกกิจกรรม',
  products_services: 'บอกสินค้าหรือบริการหลักที่ถูกต้องอย่างน้อยหนึ่งอย่างก็เพียงพอ',
  authorized_representative: 'ตอบว่ากรรมการ ไม่ต้องบอกเงื่อนไขการลงนามหรือตราบริษัท',
  attendee_identity:
    'ชื่อผู้เรียนและตำแหน่งกรรมการต้องตรง โดยยอมรับคำนำหน้าและการเว้นวรรคที่ต่างกัน',
  registration_date: 'วันเดียวกันในรูปปี พ.ศ. หรือ ค.ศ. ถือว่าถูก',
  account_purpose: 'สื่อความหมายทั้งรับเงินจากลูกค้าและจ่ายค่าใช้จ่ายของบริษัท',
  customer_origin:
    'บอกวิธีหาลูกค้าอย่างน้อยหนึ่งช่องทางที่ตรงกับข้อมูล ไม่ต้องบอกทุกช่องทาง และไม่ต้องพูดถึงเว็บไซต์ถ้าไม่มี',
  monthly_revenue: 'ตัวเลขรายได้ต่อเดือนคลาดเคลื่อนได้ไม่เกิน 20%',
  monthly_transactions: 'จำนวนธุรกรรมต่อเดือนคลาดเคลื่อนได้ไม่เกิน 20%',
  average_transaction: 'ยอดเฉลี่ยต่อธุรกรรมคลาดเคลื่อนได้ไม่เกิน 20%',
};

export function readinessRubric(concept: ConceptId): string {
  return RUBRICS[concept] ?? 'ยอมรับคำตอบที่มีความหมายตรงกับข้อมูลบริษัทโดยรวม';
}

/** V3 stores and scores only the two outcomes the learner sees. */
export function binaryReadinessAssessment(
  plan: InterviewPlan,
  assessment: Assessment | null,
): Assessment | null {
  if (plan.version !== 3 || !assessment) return assessment;
  return {
    ...assessment,
    verdict: assessment.verdict === 'correct' ? 'correct' : 'wrong',
  };
}
