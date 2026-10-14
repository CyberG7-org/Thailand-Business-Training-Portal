'use client';

import { UploadFirstForm } from '../dbd-records/new/upload-first-form';

/** The manager's main Companies tab uses the same ZIP-or-image intake as the dedicated page. */
export function CreateDbdForm({
  extractionAvailable,
  pdfExtractionAvailable,
  zipExtractionAvailable,
  embedded = false,
}: {
  extractionAvailable: boolean;
  pdfExtractionAvailable: boolean;
  zipExtractionAvailable: boolean;
  embedded?: boolean;
}) {
  return (
    <UploadFirstForm
      extractionAvailable={extractionAvailable}
      pdfExtractionAvailable={pdfExtractionAvailable}
      zipExtractionAvailable={zipExtractionAvailable}
      embedded={embedded}
    />
  );
}
