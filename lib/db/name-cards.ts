import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { after } from 'next/server';
import { getPolicy } from '@/lib/config/policy';
import type { Director } from '@/lib/domain/dbd-record';
import {
  buildNameCardData,
  missingNameCardFields,
  type NameCardData,
  type NameCardLinks,
  type NameCardSource,
} from '@/lib/domain/name-card';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { normalizeThaiMobile } from '@/lib/domain/phone';
import { ReactPdfRenderer, type PdfRenderer } from '@/lib/integrations/pdf/name-card';
import { createSupabaseAdminClient } from './admin';
import { getActiveAssignmentForUser } from './assignments';
import { pinnedFactsFor } from './pinning';
import type { Database } from './database.types';
import { examPassedFor } from './exam';

type Db = SupabaseClient<Database>;
export type NameCardRow = Database['public']['Tables']['name_cards']['Row'];

export class NameCardError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'no_assignment'
      | 'exam_required'
      | 'invalid_phone'
      | 'invalid_name'
      | 'no_phone'
      | 'no_name'
      | 'missing_fields'
      | 'not_found',
    public readonly fields: string[] = [],
  ) {
    super(message);
    this.name = 'NameCardError';
  }
}

const BUCKET = 'name-cards';

/**
 * A short digest of everything a card prints, layout included. It closes the PDF's file name,
 * so a card is current exactly when the same digest comes out of today's facts — a training
 * version that changes the company's address, email or products makes a new card even when the
 * holder, phone and record are the same (D96).
 */
function fingerprintOf(data: NameCardData): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}
const SIGNED_URL_SECONDS = 300;

/** The holder's name on the card: the role (D95), the profile, a director. */
async function sourceFor(userId: string): Promise<{
  source: NameCardSource;
  dbdRecordId: string;
  defaultHolderName: string;
  /** The company's addresses from its zip (D101); the learner's own are the fallback. */
  links: NameCardLinks;
}> {
  const admin = createSupabaseAdminClient();
  const assignment = await getActiveAssignmentForUser(admin, userId);
  if (!assignment) throw new NameCardError('No active assignment', 'no_assignment');
  const pinned = await pinnedFactsFor(admin, assignment);
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, contact_email')
    .eq('id', userId)
    .single();
  // The company email the card prints: the record's when a manager typed one, otherwise the
  // learner's own, which is what the card is for (D80, D101).
  const email = (recordEmail: string | null) => recordEmail || profile?.contact_email || null;
  const r = assignment.dbd_records;
  const interview = readStructuredData(r.structured_data).interview;
  const directors = (r.directors as unknown as Director[] | null) ?? [];
  return {
    dbdRecordId: assignment.dbd_record_id,
    defaultHolderName:
      pinned?.role?.holder_name?.trim() ||
      assignment.holder_name?.trim() ||
      profile?.display_name?.trim() ||
      directors[0]?.name_th?.trim() ||
      '',
    // The pinned version (D75); the live row only while the record has no version yet.
    source: pinned
      ? {
          company_name_th: pinned.snapshot.facts.company_name_th,
          company_name_en: pinned.snapshot.facts.company_name_en,
          head_office_address: pinned.snapshot.extras.head_office_address,
          juristic_id: pinned.snapshot.facts.juristic_id,
          contact_email: email(pinned.snapshot.extras.contact_email),
          nature_of_business: pinned.snapshot.facts.nature_of_business,
        }
      : {
          company_name_th: r.company_name_th,
          company_name_en: r.company_name_en,
          head_office_address: r.head_office_address,
          juristic_id: r.juristic_id,
          contact_email: email(interview?.contact_email ?? null),
          nature_of_business: interview?.nature_of_business ?? null,
        },
    links: { website: r.website ?? null, facebookPage: r.facebook_page ?? null },
  };
}

/** Renders and stores a new card; never fabricates missing DBD data (BR-008). */
export type NameCardInput = { phone: string; holderNameTh: string } & Partial<NameCardLinks>;

export async function generateNameCard(
  userId: string,
  input: NameCardInput,
  renderer: PdfRenderer,
): Promise<NameCardRow> {
  const admin = createSupabaseAdminClient();
  const phone = normalizeThaiMobile(input.phone);
  if (!phone) throw new NameCardError('Invalid Thai mobile number', 'invalid_phone');
  const nameTh = input.holderNameTh.trim();
  if (!nameTh) throw new NameCardError('Holder name required', 'invalid_name');

  const [requireExam, exam] = await Promise.all([
    getPolicy('require_exam_pass_for_name_card'),
    examPassedFor(userId),
  ]);
  if (requireExam && !exam.passed) throw new NameCardError('Exam pass required', 'exam_required');

  const { source, dbdRecordId, links } = await sourceFor(userId);
  const missing = missingNameCardFields(source);
  if (missing.length > 0) throw new NameCardError('Missing DBD fields', 'missing_fields', missing);

  const data = buildNameCardData(source, phone, nameTh, {
    website: links.website ?? input.website ?? null,
    facebookPage: links.facebookPage ?? input.facebookPage ?? null,
  });
  const bytes = await renderer.renderNameCard(data);
  const path = `${userId}/${Date.now()}-${data.templateVersion}-${fingerprintOf(data)}.pdf`;
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
      holder_name: data.holderName,
      holder_name_en: null,
      template_version: data.templateVersion,
      pdf_path: path,
    })
    .select()
    .single();
  if (error) throw error;
  return row;
}

/** The card as it stands, or why it cannot be made yet. */
export type EnsuredNameCard =
  | { card: NameCardRow; blocked: null }
  | { card: null; blocked: { code: NameCardError['code']; fields: string[] } };

/**
 * The learner's name card, made from what staff entered (D96): the holder's name from the
 * documents (D95), the phone given at Create learner, the company from its record. The learner
 * types nothing. A card that prints exactly what today's facts would (its fingerprint) is kept;
 * any change — name, phone, layout, or a training version that changes the company's side —
 * makes a new one, so the card follows the record without anyone asking for it.
 */
export async function ensureNameCard(
  userId: string,
  renderer: PdfRenderer,
): Promise<EnsuredNameCard> {
  const admin = createSupabaseAdminClient();
  try {
    const [requireExam, exam, found, { data: profile }, latest] = await Promise.all([
      getPolicy('require_exam_pass_for_name_card'),
      examPassedFor(userId),
      sourceFor(userId),
      admin.from('profiles').select('phone, website, facebook_page').eq('id', userId).single(),
      getMyLatestNameCard(admin, userId),
    ]);
    if (requireExam && !exam.passed) {
      throw new NameCardError('Exam pass required', 'exam_required');
    }
    const missing = missingNameCardFields(found.source);
    if (missing.length > 0) {
      throw new NameCardError('Missing DBD fields', 'missing_fields', missing);
    }
    const phone = profile?.phone ? normalizeThaiMobile(profile.phone) : null;
    if (!phone) throw new NameCardError('No phone given for the learner', 'no_phone');
    const name = found.defaultHolderName.trim();
    if (!name) throw new NameCardError('No holder name', 'no_name');
    // Current when it was made for this company from exactly what would be printed today.
    // The learner's website and Facebook page, as a manager gave them (D99).
    const links = {
      website: profile?.website ?? null,
      facebookPage: profile?.facebook_page ?? null,
    };
    const printed = buildNameCardData(found.source, phone, name, links);
    const current =
      latest &&
      latest.dbd_record_id === found.dbdRecordId &&
      latest.pdf_path.endsWith(`-${fingerprintOf(printed)}.pdf`);
    if (current) return { card: latest, blocked: null };
    const card = await generateNameCard(userId, { phone, holderNameTh: name, ...links }, renderer);
    return { card, blocked: null };
  } catch (e) {
    if (e instanceof NameCardError) {
      return { card: null, blocked: { code: e.code, fields: e.fields } };
    }
    throw e;
  }
}

/**
 * Makes or remakes a learner's card after staff changed what it prints (D96): a learner created
 * or given a company, a new phone, name or training version. A card that cannot be made yet, or
 * a render that fails, never stops what staff were doing — the learner's page tries again and
 * says why.
 */
export async function refreshNameCard(userId: string): Promise<void> {
  try {
    await ensureNameCard(userId, new ReactPdfRenderer());
  } catch (e) {
    console.error(`name card: could not make the card for ${userId}`, e);
  }
}

/** The same, once the response has gone: a staff action never waits for a card to render. */
export function refreshNameCardAfter(userId: string): void {
  after(() => refreshNameCard(userId));
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
