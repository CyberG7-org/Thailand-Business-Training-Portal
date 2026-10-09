import type { Assessment, ConceptId, InterviewPlan, PlanItem } from './types';

export type BinaryReadinessVerdict = 'correct' | 'wrong';

const THAI_DIGITS = /[๐-๙]/g;
const POLITE_ENDING = /(ครับ|ค่ะ|คะ|นะครับ|นะคะ)+$/;
const EVASIVE = /ไม่ทราบ|ไม่รู้|ไม่แน่ใจ|จำไม่ได้/;

const arabicDigits = (value: string) =>
  value.replace(THAI_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0e50));

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

const withinTwentyPercent = (answer: string, expected: string) => {
  const actual = numbers(answer)[0];
  const target = numbers(expected)[0];
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

const addressMatches = (answer: string, expected: string) => {
  const target = compact(expected);
  const parts = arabicDigits(answer)
    .split(/[\s,./_-]+/)
    .map((part) =>
      compact(part).replace(/^(เลขที่|หมู่ที่|หมู่|ถนน|ซอย|แขวง|เขต|ตำบล|อำเภอ|จังหวัด)/, ''),
    )
    .filter((part) => part.length >= 2);
  return new Set(parts.filter((part) => target.includes(part))).size >= 2;
};

const signingAuthorityMatches = (answer: string, expected: string) => {
  const actual = compact(answer)
    .replaceAll('ลงลายมือชื่อ', 'ลงนาม')
    .replaceAll('สำคัญของบริษัท', '');
  const target = compact(expected)
    .replaceAll('ลงลายมือชื่อ', 'ลงนาม')
    .replaceAll('สำคัญของบริษัท', '');
  const oneDirectorRequired = /กรรมการหนึ่งคน/.test(target);
  const sealRequired = /ตรา/.test(target);
  return (
    (!oneDirectorRequired || /กรรมการหนึ่งคน/.test(actual)) &&
    /ลงนาม/.test(actual) &&
    (!sealRequired || /ตรา/.test(actual))
  );
};

const attendeeMatches = (answer: string, expected: string) => {
  const [name = '', position = ''] = expected.split(' / ');
  const withoutTitle = (value: string) => compact(value).replace(/^(นาย|นางสาว|นาง|ดร|คุณ)/, '');
  const actual = withoutTitle(answer);
  return actual.includes(withoutTitle(name)) && actual.includes(compact(position));
};

const dateMatches = (answer: string, expected: string) => {
  const actual = compact(answer);
  const target = compact(expected);
  const targetNumbers = numbers(expected);
  const actualNumbers = numbers(answer);
  const targetYear = targetNumbers.find((number) => number >= 1900);
  const actualYear = actualNumbers.find((number) => number >= 1900);
  if (!targetYear || !actualYear) return false;
  const yearMatches =
    actualYear === targetYear || actualYear === targetYear - 543 || actualYear === targetYear + 543;
  const targetDay = targetNumbers.find((number) => number >= 1 && number <= 31);
  const actualDay = actualNumbers.find((number) => number >= 1 && number <= 31);
  const months = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];
  const month = months.find((candidate) => target.includes(candidate));
  return yearMatches && targetDay === actualDay && Boolean(month && actual.includes(month));
};

const accountPurposeMatches = (answer: string) => {
  const actual = compact(answer);
  const receives = /รับ/.test(actual) && /(ลูกค้า|ชำระ|ยอดขาย)/.test(actual);
  const pays = /จ่าย/.test(actual) && /(ค่าใช้จ่าย|บริษัท|กิจการ|ธุรกิจ)/.test(actual);
  return receives && pays;
};

const customerOriginMatches = (answer: string, expected: string) => {
  const actual = compact(answer);
  const target = compact(expected);
  const channels = ['facebook', 'tiktok', 'เว็บไซต์', 'แนะนำ', 'หน้าร้าน', 'เข้ามาที่ร้าน'];
  return channels.some((channel) => target.includes(channel) && actual.includes(channel));
};

/** One deterministic rubric for local testing and non-AI fallbacks. */
export function evaluateReadinessAnswer(item: PlanItem, answer: string): BinaryReadinessVerdict {
  if (answer.trim().length < 2 || EVASIVE.test(answer)) return 'wrong';
  const expected = item.expected;
  let correct = false;
  switch (item.concept) {
    case 'company_name':
      correct = compact(answer) === compact(expected);
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
      correct = looseMeaning(answer, expected);
      break;
    case 'authorized_representative':
      correct = signingAuthorityMatches(answer, expected);
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
  company_name: 'ตอบชื่อบริษัทภาษาไทยที่จดทะเบียนครบถ้วน โดยไม่สนใจช่องว่างหรือเครื่องหมาย',
  registration_number: 'เลขทะเบียน 13 หลักต้องตรงกัน โดยไม่สนใจช่องว่างหรือขีด',
  registered_address:
    'ที่อยู่โดยรวมถูกต้อง ไม่ต้องครบทุกคำ; จังหวัดและส่วนสำคัญอีกหนึ่งส่วนก็เพียงพอ',
  actual_business: 'คำอธิบายสั้น ๆ ที่ตรงกับธุรกิจหลักก็เพียงพอ ไม่ต้องบอกทุกกิจกรรม',
  products_services: 'บอกสินค้าหรือบริการหลักที่ถูกต้องอย่างน้อยหนึ่งอย่างก็เพียงพอ',
  authorized_representative: 'ความหมายต้องตรงกับเงื่อนไขผู้ลงนาม รวมจำนวนกรรมการและตราบริษัทถ้ามี',
  attendee_identity: 'ชื่อผู้เรียนและตำแหน่งต้องตรง โดยยอมรับคำนำหน้าและการเว้นวรรคที่ต่างกัน',
  registration_date: 'วันเดียวกันในรูปปี พ.ศ. หรือ ค.ศ. ถือว่าถูก',
  account_purpose: 'สื่อความหมายทั้งรับเงินจากลูกค้าและจ่ายค่าใช้จ่ายของบริษัท',
  customer_origin: 'ตอบช่องทางที่ถูกต้องเพียงหนึ่งช่องทางก็ถือว่าถูก',
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
