import { describe, expect, it } from 'vitest';
import { NO_ANSWER, answerFromPassages } from '@/lib/integrations/rag/answer';
import type { Passage } from '@/lib/integrations/vector/types';

const passages: Passage[] = [
  {
    id: 'd#1#0',
    documentId: 'd',
    documentType: 'certificate',
    page: 1,
    text: 'หนังสือรับรอง\nทุนจดทะเบียน 2,000,000 บาท\nอื่น ๆ',
    score: 1,
  },
];
const names = new Map([['d', 'certificate.pdf']]);

describe('answerFromPassages', () => {
  it('fake: cites the matching line of the best passage', async () => {
    const answer = await answerFromPassages('ทุนจดทะเบียน', passages, names, 'fake');
    expect(answer).toBe('ทุนจดทะเบียน 2,000,000 บาท (certificate.pdf, หน้า 1)');
  });

  it('fake: says so when nothing was found; off: returns null', async () => {
    expect(await answerFromPassages('x', [], names, 'fake')).toBe(NO_ANSWER);
    expect(await answerFromPassages('x', passages, names, 'off')).toBeNull();
  });
});
