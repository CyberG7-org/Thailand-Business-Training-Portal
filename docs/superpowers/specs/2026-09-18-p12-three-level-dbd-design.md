# P12 — Three-level DBD extraction

| | |
|---|---|
| Builds on | P1.5 extraction adapter, D37 auto-fill |
| Requested by | owner (2026-09-18): "structure the AI parser into three extraction levels, all taken from the Thai DBD" |
| Status | Implemented |

## 1. The levels

| Level | Fields | Source document | Stored in |
|---|---|---|---|
| 1 — Company identity | company name (TH/EN), registration number, registration date, capital, directors, signing authority, registered address, province | หนังสือรับรอง | `dbd_records` columns |
| 2 — Business profile | objectives, business categories, share structure (total shares, par value, paid-up, type), shareholders, promoters | objectives sheet, บอจ.5, บอจ.2 | `dbd_records.structured_data.business` |
| 3 — Document metadata | document type per upload, certificate number, reference number, issue date, registrar, registration office, source document + page, AI confidence | all | columns + `dbd_documents.document_type` + `structured_data.provenance` |

## 2. Flow

1. Admin uploads one or more PDFs (30 MB each, 6 per record). Each becomes a `dbd_documents` row; the first stays `dbd_records.document_path` for learners and the question generator.
2. `runExtraction` sends every document as its own block in upload order; the model returns the three levels plus a `documents[]` classification, which is written back to `dbd_documents.document_type`.
3. `extractAndApply` fills empty Level 1/3 columns (D37), fills Level 2 only when the stored profile is empty, and always refreshes provenance.
4. The record page shows three fieldsets; Level 2 lists are editable as "one per line" text; every auto-filled value shows confidence, source document and page until the record is confirmed.

## 3. Decisions

- **D38** (see decisions log). Level 2 values that no uploaded document contains stay empty — the model is told never to invent, and the fill step never writes empty lists over admin text.
- Legacy `extraction_raw` rows (pre-provenance) are normalised on read (`normalizeStoredExtraction`).
- Level 2 names are banned literals for AI question generation, like directors.

## 4. Tests

Unit: merge rule, Level 2 placeholders. Integration: multi-document fill, classification, removal. E2E: upload-first creation shows all three levels, editing Level 2, confirm.
