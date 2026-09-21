import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { trigramOverlap } from '@/lib/domain/rag/score';
import {
  resolveQuestionGenProvider,
  type QuestionGenProvider,
} from '@/lib/integrations/question-gen';
import type { Passage } from '@/lib/integrations/vector/types';

export const NO_ANSWER = 'ไม่พบในเอกสาร';
const MODEL = 'claude-sonnet-5';

const SYSTEM = [
  "You answer an administrator's question about a Thai company's DBD registration documents using ONLY the passages provided.",
  'Answer in the language of the question (Thai, English or Chinese) in at most three sentences, quoting figures and names exactly as written.',
  'After each fact cite its source as (document name, หน้า n).',
  `If the passages do not contain the answer, reply exactly: ${NO_ANSWER}`,
].join(' ');

function passageBlock(passages: Passage[], documentNames: Map<string, string>): string {
  return passages
    .map(
      (p, i) =>
        `[${i + 1}] ${documentNames.get(p.documentId) ?? p.documentId}, หน้า ${p.page}\n${p.text}`,
    )
    .join('\n\n');
}

/**
 * Grounded answer for "Ask the documents" (spec §8). Uses the question-generation provider
 * rule: claude with a key, fake in dev (echoes the best passage), off in production without a key.
 */
export async function answerFromPassages(
  question: string,
  passages: Passage[],
  documentNames: Map<string, string>,
  provider: QuestionGenProvider = resolveQuestionGenProvider(),
  client?: Anthropic,
): Promise<string | null> {
  if (provider === 'off') return null;
  if (passages.length === 0) return NO_ANSWER;
  if (provider === 'fake') {
    // The line of the best passage that shares most with the question, e.g. "ทุนจดทะเบียน 2,000,000 บาท".
    const best = passages[0];
    const lines = best.text.split('\n');
    const line = [...lines].sort(
      (a, b) => trigramOverlap(question, b) - trigramOverlap(question, a),
    )[0];
    return `${line} (${documentNames.get(best.documentId) ?? best.documentId}, หน้า ${best.page})`;
  }
  // Created lazily: the SDK constructor throws without ANTHROPIC_API_KEY, which fake/off never need.
  const response = await (client ?? new Anthropic()).messages.create({
    model: MODEL,
    max_tokens: 600,
    system: SYSTEM,
    messages: [
      { role: 'user', content: `${passageBlock(passages, documentNames)}\n\nคำถาม: ${question}` },
    ],
  });
  const text = response.content.find((b) => b.type === 'text');
  return text && text.type === 'text' ? text.text.trim() : NO_ANSWER;
}
