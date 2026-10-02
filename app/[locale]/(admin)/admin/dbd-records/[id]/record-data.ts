import 'server-only';
import { cache } from 'react';
import { getDbdRecord, listDbdDocuments } from '@/lib/db/dbd-records';
import { createSupabaseServerClient } from '@/lib/db/server';
import { currentAddress } from '@/lib/db/training-sheet';
import { listOpenExceptions } from '@/lib/db/validation';
import { readStructuredData } from '@/lib/domain/dbd-profile';

/**
 * A company record and what both of its views read: the page with the tabs, and the status
 * column under the sidebar (`@side`). Cached for the request, so the two views ask once.
 */
export const loadRecord = cache(async (id: string) => {
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record) return null;
  const structured = readStructuredData(record.structured_data);
  const [documents, exceptions, address] = await Promise.all([
    listDbdDocuments(db, id),
    listOpenExceptions(db, record.id),
    // Derived on the fly when not stored yet (a record saved before P17a); never written on a GET.
    currentAddress(db, record, structured),
  ]);
  return { db, record, structured, documents, exceptions, address };
});
