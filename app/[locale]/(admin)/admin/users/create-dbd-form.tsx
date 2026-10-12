'use client';

import { UploadFirstForm } from '../dbd-records/new/upload-first-form';

/** The manager's main Companies tab uses the same ZIP-or-image intake as the dedicated page. */
export function CreateDbdForm({
  extractionAvailable,
  zipExtractionAvailable,
  embedded = false,
}: {
  extractionAvailable: boolean;
  zipExtractionAvailable: boolean;
  embedded?: boolean;
}) {
  return (
    <UploadFirstForm
      extractionAvailable={extractionAvailable}
      zipExtractionAvailable={zipExtractionAvailable}
      embedded={embedded}
    />
  );
}
