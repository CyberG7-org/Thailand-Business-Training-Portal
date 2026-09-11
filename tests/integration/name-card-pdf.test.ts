import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNameCardData } from '@/lib/domain/name-card';
import { ReactPdfRenderer } from '@/lib/integrations/pdf/name-card';

function hasPdftotext(): boolean {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('name card PDF (spike S3)', () => {
  it('renders Thai text and digits with the embedded font', async () => {
    const data = buildNameCardData(
      {
        company_name_th: 'บริษัท ตัวอย่างนามบัตร จำกัด',
        company_name_en: 'SAMPLE CARD CO., LTD.',
        head_office_address: '99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง 10110',
        juristic_id: '0105569000123',
        directors: [{ name_th: 'นางสาวตัวอย่าง ทดสอบ', name_en: null }],
        holder_name: null,
      },
      '0812345678',
    );
    const bytes = await new ReactPdfRenderer().renderNameCard(data);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(10_000); // font subset embedded

    if (!hasPdftotext()) return;
    const dir = mkdtempSync(path.join(tmpdir(), 'namecard-'));
    try {
      const file = path.join(dir, 'card.pdf');
      writeFileSync(file, bytes);
      const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
      expect(text).toContain('081-234-5678');
      expect(text).toContain('0105569000123');
      expect(text.replace(/\s/g, '')).toContain('บริษัท'.replace(/\s/g, ''));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
