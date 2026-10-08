import { BANK_INTERVIEW_CONCEPTS, type BankInterviewConcept } from '@/lib/domain/bank-interview';
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
export const READINESS_PASS_SCORE = 9;

const READINESS_ITEMS: readonly {
  concept: ConceptId;
  question: string;
  facts: string[];
}[] = [
  { concept: 'company_name', question: 'บริษัทชื่อเต็มว่าอะไรคะ', facts: ['company_name_th'] },
  {
    concept: 'registration_number',
    question: 'เลขทะเบียนนิติบุคคลของบริษัทคืออะไรคะ',
    facts: ['juristic_id'],
  },
  {
    concept: 'registered_address',
    question: 'ที่อยู่จดทะเบียนของบริษัทอยู่ที่ไหนคะ',
    facts: ['head_office_address'],
  },
  {
    concept: 'actual_business',
    question: 'บริษัททำธุรกิจอะไรจริงคะ',
    facts: ['nature_of_business'],
  },
  {
    concept: 'products_services',
    question: 'บริษัทขายสินค้าหรือบริการอะไรคะ',
    facts: ['products_services'],
  },
  {
    concept: 'authorized_representative',
    question: 'ใครมีอำนาจลงนามแทนบริษัทคะ',
    facts: ['directors', 'signing_authority'],
  },
  {
    concept: 'attendee_identity',
    question: 'กรุณาบอกชื่อและตำแหน่งของคุณในบริษัทค่ะ',
    facts: ['my_name', 'my_position'],
  },
  {
    concept: 'registration_date',
    question: 'บริษัทจดทะเบียนเมื่อวันที่เท่าไรคะ',
    facts: ['registered_on'],
  },
  {
    concept: 'account_purpose',
    question: 'บริษัทต้องการเปิดบัญชีนี้เพื่ออะไรคะ',
    facts: ['account_purpose'],
  },
  {
    concept: 'customer_profile',
    question: 'ลูกค้าหลักของบริษัทเป็นใครคะ',
    facts: ['customer_profile'],
  },
  {
    concept: 'transaction_details',
    question: 'บริษัทจะรับและจ่ายเงินอย่างไรคะ',
    facts: ['transaction_details'],
  },
];

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

/** The friendly v2 readiness interview: 11 fixed questions, no mandatory concept. */
export function buildReadinessPlan(facts: FactSheet): InterviewPlan {
  return {
    version: 2,
    passScore: READINESS_PASS_SCORE,
    cursor: 0,
    items: READINESS_ITEMS.map((definition) => ({
      concept: definition.concept,
      phase: 'facts' as const,
      core: false,
      question: definition.question,
      // Keep the frozen rubric answer short enough to practise in one learner message even when
      // a source document contains a very long address or business description.
      expected: (expectedFor(definition.facts, facts) ?? '').slice(0, 800),
      attempts: 0,
    })),
  };
}

export function isReadinessPlan(plan: InterviewPlan): boolean {
  return plan.version === 2;
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
