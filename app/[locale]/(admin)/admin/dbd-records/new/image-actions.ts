'use server';

import { requireStaff } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { createDbdRecord } from '@/lib/db/dbd-records';
import { validateAfterChange } from '@/lib/db/validation';
import { companyImageToDraft } from '@/lib/domain/company-image';
import {
  CompanyImageOutputError,
  extractCompanyImage,
} from '@/lib/integrations/extraction/company-image';

export type ImageUploadState = { error: string | null; recordId: string | null };

function imageMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

export async function uploadCompanyImageAction(
  _previous: ImageUploadState,
  formData: FormData,
): Promise<ImageUploadState> {
  const locale = String(formData.get('locale') ?? 'th');
  const staff = await requireStaff(locale);
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0 || file.size > 4_000_000) {
    return { error: 'Choose one JPG, PNG or WebP image under 4 MB.', recordId: null };
  }
  let created: {
    id: string;
    path: string;
    db: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  } | null = null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = imageMime(bytes);
    if (!mime) return { error: 'The file is not a valid JPG, PNG or WebP image.', recordId: null };
    const extracted = await extractCompanyImage(bytes, mime);
    const draft = companyImageToDraft(extracted);
    const db = await createSupabaseServerClient();
    const row = await createDbdRecord(
      db,
      draft.record,
      staff.id,
      {
        business: draft.business,
        interview: draft.interview,
      },
      staff.role === 'manager' ? staff.id : null,
    );
    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
    const path = `${row.id}/company-profile.${ext}`;
    created = { id: row.id, path, db };
    const { error: uploadError } = await db.storage.from('dbd-documents').upload(path, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { error: saveError } = await db
      .from('dbd_records')
      .update({
        website: draft.website,
        facebook_page: draft.facebookPage,
        structured_data: {
          business: draft.business,
          interview: draft.interview,
          source_image: { path, mime_type: mime, reviewed: false },
        },
      })
      .eq('id', row.id);
    if (saveError) throw saveError;
    await validateAfterChange(row.id, staff.id);
    return { error: null, recordId: row.id };
  } catch (error) {
    console.error('company image upload', error);
    // This request alone created the draft; a failed upload must not leave it in the list.
    if (created) {
      const { db, id, path } = created;
      await db.storage
        .from('dbd-documents')
        .remove([path])
        .catch((cleanup) => console.error('company image cleanup', cleanup));
      await db
        .from('dbd_records')
        .delete()
        .eq('id', id)
        .then(({ error: cleanup }) => {
          if (cleanup) console.error('company draft cleanup', cleanup);
        });
    }
    return {
      error:
        error instanceof CompanyImageOutputError
          ? error.message
          : 'Could not read this image. Check the Gemini key, image and storage settings, then try again.',
      recordId: null,
    };
  }
}
