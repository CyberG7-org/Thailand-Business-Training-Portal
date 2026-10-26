import { describe, expect, it } from 'vitest';
import { initialUploadFiles } from '@/lib/domain/initial-upload';
import { readStructuredData } from '@/lib/domain/dbd-profile';

describe('retained upload source paths', () => {
  it('allows only flat paths in this exact record and preserves the manifest during parsing', () => {
    const paths = [
      'record/source.pdf',
      'other/source.pdf',
      'record/../other.pdf',
      'record/sub/source.pdf',
      'record/..\\other.pdf',
      'record/%2e%2e%2fother.pdf',
    ];
    const initial_upload = {
      state: 'claimed',
      files: paths.map((path) => ({ path, name: 'source.pdf', group: 'pack' })),
    };
    expect(initialUploadFiles('record', { initial_upload }).map((f) => f.path)).toEqual([
      'record/source.pdf',
    ]);
    expect(readStructuredData({ initial_upload }).initial_upload).toEqual(initial_upload);
  });
  it('does not produce cleanup targets from malformed metadata', () => {
    expect(
      initialUploadFiles('record', {
        initial_upload: { state: 'pending', files: 'record/source.pdf' },
      }),
    ).toEqual([]);
    expect(initialUploadFiles('record', null)).toEqual([]);
  });
});
