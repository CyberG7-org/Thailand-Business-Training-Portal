import { BANK_INTERVIEW_CONCEPTS, type BankInterviewConcept } from '@/lib/domain/bank-interview';
import type { AppLocale } from '@/i18n/routing';
import type {
  Assessment,
  CloseReason,
  ConceptId,
  FactSheet,
  InterviewPlan,
  PlanItem,
} from './types';

export const JURISTIC_ID_CONCEPT: ConceptId = 'juristic_id';

/** The identity facts a director must know cold (spec §4.4). */
export const CORE_CONCEPTS: readonly ConceptId[] = [
  'company_name',
  JURISTIC_ID_CONCEPT,
  'registered_address',
  'directors_count',
];

/** Identity, then ownership, then the business and the learner's own role (spec §4.2). */
const GROUP_ORDER = ['identity', 'ownership', 'business_plan', 'personal'] as const;
const MAX_PROBING = 4;
export const READINESS_PASS_SCORE = 10;

export type ReadinessItemDefinition = {
  concept: ConceptId;
  question: Record<AppLocale, string>;
  facts: string[];
  cardKey: string;
};

export const READINESS_ITEMS: readonly ReadinessItemDefinition[] = [
  {
    concept: 'company_name',
    question: {
      th: 'บริษัทชื่อเต็มว่าอะไรคะ',
      en: 'What is your company’s full registered name?',
      zh: '公司的全名是什么？',
    },
    facts: ['company_name_th'],
    cardKey: 'bank-interview-1-identity',
  },
  {
    concept: 'registration_number',
    question: {
      th: 'เลขทะเบียนนิติบุคคลของบริษัทคืออะไรคะ',
      en: 'What is the company registration number?',
      zh: '公司的注册号是什么？',
    },
    facts: ['juristic_id'],
    cardKey: 'bank-interview-1-identity',
  },
  {
    concept: 'registered_address',
    question: {
      th: 'ที่อยู่จดทะเบียนของบริษัทอยู่ที่ไหนคะ',
      en: 'What is the company’s registered address?',
      zh: '公司的注册地址在哪里？',
    },
    facts: ['head_office_address'],
    cardKey: 'bank-interview-1-identity',
  },
  {
    concept: 'actual_business',
    question: {
      th: 'บริษัททำธุรกิจอะไรคะ',
      en: 'What business does the company do?',
      zh: '公司实际经营什么业务？',
    },
    facts: ['nature_of_business'],
    cardKey: 'bank-interview-3-business',
  },
  {
    concept: 'products_services',
    question: {
      th: 'บริษัทขายสินค้าหรือบริการอะไรคะ',
      en: 'What products or services does the company sell?',
      zh: '公司销售哪些产品或服务？',
    },
    facts: ['products_services'],
    cardKey: 'bank-interview-3-business',
  },
  {
    concept: 'authorized_representative',
    question: {
      th: 'ใครมีอำนาจลงนามแทนบริษัทคะ',
      en: 'Who can sign for the company?',
      zh: '谁有权代表公司签字？',
    },
    facts: ['directors', 'signing_authority'],
    cardKey: 'bank-interview-1-identity',
  },
  {
    concept: 'attendee_identity',
    question: {
      th: 'กรุณาบอกชื่อและตำแหน่งของคุณในบริษัทค่ะ',
      en: 'What is your name and position in the company?',
      zh: '请说出您在公司的姓名和职位。',
    },
    facts: ['my_name', 'my_position'],
    cardKey: 'bank-interview-2-ownership',
  },
  {
    concept: 'registration_date',
    question: {
      th: 'บริษัทจดทะเบียนเมื่อวันที่เท่าไรคะ',
      en: 'When was the company registered?',
      zh: '公司是什么时候注册的？',
    },
    facts: ['registered_on'],
    cardKey: 'bank-interview-1-identity',
  },
  {
    concept: 'account_purpose',
    question: {
      th: 'บริษัทต้องการเปิดบัญชีนี้เพื่ออะไรคะ',
      en: 'Why does the company need this bank account?',
      zh: '公司为什么需要这个银行账户？',
    },
    facts: ['account_purpose'],
    cardKey: 'bank-interview-4-role',
  },
  {
    concept: 'customer_origin',
    question: {
      th: 'ลูกค้าของบริษัทเป็นใคร และบริษัทหาลูกค้าอย่างไรคะ',
      en: 'Who are your customers, and how do you find them?',
      zh: '公司的客户是谁？您如何找到他们？',
    },
    facts: ['customer_profile', 'client_origin'],
    cardKey: 'bank-interview-3-business',
  },
  {
    concept: 'monthly_revenue',
    question: {
      th: 'รายได้ต่อเดือนโดยประมาณของบริษัทเท่าไรคะ',
      en: 'What is the company’s estimated monthly revenue?',
      zh: '公司预计每月收入是多少？',
    },
    facts: ['monthly_revenue'],
    cardKey: 'bank-interview-4-role',
  },
  {
    concept: 'monthly_transactions',
    question: {
      th: 'บริษัทมีธุรกรรมทั้งหมดประมาณกี่รายการต่อเดือนคะ',
      en: 'About how many transactions does the company have each month?',
      zh: '公司每月大约有多少笔交易？',
    },
    facts: ['monthly_transactions'],
    cardKey: 'bank-interview-4-role',
  },
  {
    concept: 'average_transaction',
    question: {
      th: 'ยอดเงินเฉลี่ยต่อธุรกรรมของบริษัทประมาณเท่าไรคะ',
      en: 'What is the company’s estimated average transaction amount?',
      zh: '公司预计平均每笔交易金额是多少？',
    },
    facts: ['average_transaction'],
    cardKey: 'bank-interview-4-role',
  },
];

/** Labels retained for debriefs from frozen v2 (11-question) sessions. */
const LEGACY_READINESS_ITEMS: readonly ReadinessItemDefinition[] = [
  {
    concept: 'customer_profile',
    question: {
      th: 'ลูกค้าหลักของบริษัทเป็นใครคะ',
      en: 'Who are the company’s main customers?',
      zh: '公司的主要客户是谁？',
    },
    facts: ['customer_profile'],
    cardKey: 'bank-interview-3-business',
  },
  {
    concept: 'transaction_details',
    question: {
      th: 'บริษัทจะรับและจ่ายเงินอย่างไรคะ',
      en: 'How will the company receive and pay money?',
      zh: '公司将如何收款和付款？',
    },
    facts: ['transaction_details'],
    cardKey: 'bank-interview-4-role',
  },
];

export function readinessItem(concept: ConceptId): ReadinessItemDefinition | null {
  return (
    READINESS_ITEMS.find((item) => item.concept === concept) ??
    LEGACY_READINESS_ITEMS.find((item) => item.concept === concept) ??
    null
  );
}

const JURISTIC_ITEM: Omit<PlanItem, 'expected' | 'attempts'> = {
  concept: JURISTIC_ID_CONCEPT,
  phase: 'facts',
  core: true,
  question: 'เลขทะเบียนนิติบุคคลของบริษัทคือหมายเลขอะไรคะ',
};

function expectedFor(placeholders: string[], facts: FactSheet): string | null {
  const values = placeholders
    .map((p) => facts[p])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return values.length ? values.join(' / ') : null;
}

function item(concept: BankInterviewConcept, facts: FactSheet): PlanItem | null {
  const expected = expectedFor(concept.placeholders, facts);
  // Every concept names placeholders; one the record cannot fill is not asked (spec §4.2).
  if (expected === null) return null;
  return {
    concept: concept.id,
    phase: 'facts',
    core: CORE_CONCEPTS.includes(concept.id),
    question: concept.question.th,
    expected,
    attempts: 0,
  };
}

/** The facts phase: every concept the record can verify, in the bank's order. */
export function buildPlan(facts: FactSheet): InterviewPlan {
  const items: PlanItem[] = [];
  for (const group of GROUP_ORDER) {
    for (const concept of BANK_INTERVIEW_CONCEPTS.filter((c) => c.group === group)) {
      const built = item(concept, facts);
      if (built) items.push(built);
      if (concept.id === 'company_name' && facts.juristic_id) {
        items.push({ ...JURISTIC_ITEM, expected: facts.juristic_id, attempts: 0 });
      }
    }
  }
  return { items, cursor: 0 };
}

/** The friendly v3 readiness interview: 13 fixed questions, no mandatory concept. */
export function buildReadinessPlan(facts: FactSheet): InterviewPlan {
  return {
    version: 3,
    passScore: READINESS_PASS_SCORE,
    cursor: 0,
    items: READINESS_ITEMS.map((definition) => ({
      concept: definition.concept,
      phase: 'facts' as const,
      core: false,
      question: definition.question.th,
      // Keep the frozen rubric answer short enough to practise in one learner message even when
      // a source document contains a very long address or business description.
      expected: (expectedFor(definition.facts, facts) ?? '').slice(0, 800),
      attempts: 0,
    })),
  };
}

export function isReadinessPlan(plan: InterviewPlan): boolean {
  return plan.version === 2 || plan.version === 3;
}

export function nextReadinessStep(
  plan: InterviewPlan,
  assessment: Assessment | null,
): {
  next: { concept: ConceptId } | { close: 'plan_complete' };
  kind: 'follow_up' | 'next' | 'complete';
} {
  const item = currentItem(plan);
  if (!isReadinessPlan(plan) || !item) {
    return { next: { close: 'plan_complete' }, kind: 'complete' };
  }
  if (assessment?.verdict !== 'correct' && item.attempts < 1) {
    return { next: { concept: item.concept }, kind: 'follow_up' };
  }
  const following = plan.items[plan.cursor + 1];
  return following
    ? { next: { concept: following.concept }, kind: 'next' }
    : { next: { close: 'plan_complete' }, kind: 'complete' };
}

/** What the risk officer comes back to: anything short of correct, worst first, at most four. */
export function probingItems(plan: InterviewPlan, assessments: Assessment[]): PlanItem[] {
  if (isReadinessPlan(plan)) return [];
  const rank = { evasive: 0, wrong: 1, pasted: 2, off_topic: 3, partial: 4, correct: 5 } as const;
  const latest = new Map<ConceptId, Assessment>();
  for (const a of assessments) latest.set(a.concept, a);
  return [...latest.values()]
    .filter((a) => a.verdict !== 'correct')
    .sort((x, y) => rank[x.verdict] - rank[y.verdict])
    .slice(0, MAX_PROBING)
    .map((a) => {
      const source = plan.items.find((i) => i.concept === a.concept);
      return {
        concept: a.concept,
        phase: 'probing',
        core: source?.core ?? false,
        question: source?.question ?? '',
        expected: source?.expected ?? '',
        attempts: 0,
      };
    });
}

export function currentItem(plan: InterviewPlan): PlanItem | null {
  return plan.items[plan.cursor] ?? null;
}

/**
 * Same concept again = one more attempt; another concept = move there; close = park past the
 * end. A concept the probing phase repeats exists twice in the items, so the search starts at
 * the cursor and only then falls back to the whole plan.
 */
export function advance(
  plan: InterviewPlan,
  to: { concept: ConceptId } | { close: CloseReason },
): InterviewPlan {
  if ('close' in to) return { ...plan, cursor: plan.items.length };
  const ahead = plan.items.findIndex((i, n) => n >= plan.cursor && i.concept === to.concept);
  const index = ahead >= 0 ? ahead : plan.items.findIndex((i) => i.concept === to.concept);
  if (index < 0) return plan;
  if (index === plan.cursor) {
    const items = plan.items.map((i, n) => (n === index ? { ...i, attempts: i.attempts + 1 } : i));
    return { ...plan, items, cursor: index };
  }
  return { ...plan, cursor: index };
}
