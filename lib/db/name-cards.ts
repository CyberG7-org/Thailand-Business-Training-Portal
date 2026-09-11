import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '@/lib/config/policy';
import type { Director } from '@/lib/domain/dbd-record';
import {
  buildNameCardData,
  missingNameCardFields,
  type NameCardSource,
} from '@/lib/domain/name-card';
import { normalizeThaiMobile } from '@/lib/domain/phone';
import type { PdfRenderer } from '@/lib/integrations/pdf/name-card';
import { createSupabaseAdminClient } from './admin';
import { getActiveAssignmentForUser } from './assignments';
import type { Database } from './database.types';
import { examPassedFor } from './exam';

type Db = SupabaseClient<Database>;
export type NameCardRow = Database['public']['Tables']['name_cards']['Row'];

export class NameCardError extends Error {
  constructor(
    message: string,
    public readonly code:
      'no_assignment' | 'exam_required' | 'invalid_phone' | 'missing_fields' | 'not_found',
    public readonly fields: string[] = [],
  ) {
    super(message);
    this.name = 'NameCardError';
  }
}

const BUCKET = 'name-cards';
const SIGNED_URL_SECONDS = 300;

async function sourceFor(userId: string): Promise<{ source: NameCardSource; dbdRecordId: string }> {
  const admin = createSupabaseAdminClient();
  const assignment = await getActiveAssignmentForUser(admin, userId);
  if (!assignment) throw new NameCardError('No active assignment', 'no_assignment');
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .single();
  const r = assignment.dbd_records;
  return {
    dbdRecordId: assignment.dbd_record_id,
    source: {
      company_name_th: r.company_name_th,
      company_name_en: r.company_name_en,
      head_office_address: r.head_office_address,
      juristic_id: r.juristic_id,
      directors: (r.directors as unknown as Director[] | null) ?? null,
      holder_name: profile?.display_name ?? null,
    },
  };
}

/** What the page needs to decide whether generation is possible. */
export async function nameCardReadiness(userId: string): Promise<{
  examRequired: boolean;
  examPassed: boolean;
  missingFields: string[];
}> {
  const [requireExam, exam] = await Promise.all([
    getPolicy('require_exam_pass_for_name_card'),
    examPassedFor(userId),
  ]);
  let missingFields: string[] = [];
  try {
    missingFields = missingNameCardFields((await sourceFor(userId)).source);
  } catch {
    missingFields = ['company_name_th', 'head_office_address'];
  }
  return { examRequired: requireExam, examPassed: exam.passed, missingFields };
}

/** Renders and stores a new card; never fabricates missing DBD data (BR-008). */
export async function generateNameCard(
  userId: string,
  phoneInput: string,
  renderer: PdfRenderer,
): Promise<NameCardRow> {
  const admin = createSupabaseAdminClient();
  const phone = normalizeThaiMobile(phoneInput);
  if (!phone) throw new NameCardError('Invalid Thai mobile number', 'invalid_phone');

  const [requireExam, exam] = await Promise.all([
    getPolicy('require_exam_pass_for_name_card'),
    examPassedFor(userId),
  ]);
  if (requireExam && !exam.passed) throw new NameCardError('Exam pass required', 'exam_required');

  const { source, dbdRecordId } = await sourceFor(userId);
  const missing = missingNameCardFields(source);
  if (missing.length > 0) throw new NameCardError('Missing DBD fields', 'missing_fields', missing);

  const data = buildNameCardData(source, phone);
  const bytes = await renderer.renderNameCard(data);
  const path = `${userId}/${Date.now()}-${data.templateVersion}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf' });
  if (uploadError) throw uploadError;

  const { data: row, error } = await admin
    .from('name_cards')
    .insert({
      user_id: userId,
      dbd_record_id: dbdRecordId,
      phone_number: phone,
      template_version: data.templateVersion,
      pdf_path: path,
    })
    .select()
    .single();
  if (error) throw error;
  return row;
}

export async function getMyLatestNameCard(db: Db, userId: string): Promise<NameCardRow | null> {
  const { data, error } = await db
    .from('name_cards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Signed URL for the learner's own card only. */
export async function createMyNameCardUrl(userId: string, cardId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data: card } = await admin
    .from('name_cards')
    .select('pdf_path')
    .eq('id', cardId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!card) return null;
  const { data } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(card.pdf_path, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

/** Queues the PDF for every configured Telegram destination (idempotent per card + chat). */
export async function queueNameCardToTelegram(userId: string, cardId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data: card } = await admin
    .from('name_cards')
    .select(
      'id, pdf_path, phone_number, dbd_records(company_name_th), profiles!inner(login_id, display_name)',
    )
    .eq('id', cardId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!card) throw new NameCardError('Card not found', 'not_found');
  const chatIds = await getPolicy('telegram_admin_chat_ids');
  if (chatIds.length === 0) return 0;
  const profile = card.profiles as unknown as { login_id: string; display_name: string | null };
  const record = card.dbd_records as unknown as { company_name_th: string | null } | null;
  const rows = chatIds.map((chatId) => ({
    event_type: 'name_card',
    channel: 'telegram',
    destination_ref: chatId,
    payload: {
      card_id: card.id,
      pdf_path: card.pdf_path,
      login_id: profile.login_id,
      display_name: profile.display_name,
      company_name_th: record?.company_name_th ?? null,
    },
    idempotency_key: `name_card:${card.id}:telegram:${chatId}`,
  }));
  const { error } = await admin
    .from('notifications')
    .upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true });
  if (error) throw error;
  await admin
    .from('name_cards')
    .update({ telegram_sent_at: new Date().toISOString() })
    .eq('id', card.id);
  return rows.length;
}

/** Used by the queue processor to attach the PDF. */
export async function downloadNameCardPdf(pdfPath: string): Promise<Uint8Array> {
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).download(pdfPath);
  if (error || !data) throw new Error('Name card PDF not found in storage');
  return new Uint8Array(await data.arrayBuffer());
}
