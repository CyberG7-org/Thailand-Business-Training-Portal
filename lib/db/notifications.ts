import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_NOTIFICATION_ATTEMPTS,
  backoffMinutes,
  examResultMessage,
  type ExamResultPayload,
} from '@/lib/domain/notifications';
import type { Notifier, OutboundDocument, OutboundMessage } from '@/lib/integrations/notify/types';
import { createSupabaseAdminClient } from './admin';
import type { Database } from './database.types';
import { downloadNameCardPdf } from './name-cards';

type Db = SupabaseClient<Database>;
export type NotificationRow = Database['public']['Tables']['notifications']['Row'];

export type NotifierResolver = (channel: 'telegram' | 'email') => Notifier | null;

type NameCardPayload = {
  card_id: string;
  pdf_path: string;
  login_id: string;
  display_name: string | null;
  company_name_th: string | null;
};

async function render(
  row: NotificationRow,
): Promise<{ message: OutboundMessage; document: OutboundDocument | null }> {
  const base = {
    channel: row.channel as OutboundMessage['channel'],
    destination: row.destination_ref ?? '',
  };
  if (row.event_type === 'exam_result') {
    const { subject, text } = examResultMessage(row.payload as unknown as ExamResultPayload);
    return { message: { ...base, subject, text }, document: null };
  }
  if (row.event_type === 'name_card') {
    const p = row.payload as unknown as NameCardPayload;
    const who = p.display_name ? `${p.display_name} (${p.login_id})` : p.login_id;
    return {
      message: {
        ...base,
        subject: `[Name card] ${who}`,
        text: `นามบัตร: ${p.company_name_th ?? '-'}
Name card for ${who}`,
      },
      document: {
        filename: `name-card-${p.login_id}.pdf`,
        contentType: 'application/pdf',
        bytes: await downloadNameCardPdf(p.pdf_path),
      },
    };
  }
  throw new Error(`Unknown notification event: ${row.event_type}`);
}

export type ProcessSummary = { claimed: number; sent: number; failed: number; retried: number };

/** One worker run: lease due rows, send each, mark sent or schedule a retry (ADR 0004, D23). */
export async function processDueNotifications(
  resolve: NotifierResolver,
  limit = 20,
): Promise<ProcessSummary> {
  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin.rpc('claim_notifications', { p_limit: limit });
  if (error) throw error;
  const summary: ProcessSummary = { claimed: rows.length, sent: 0, failed: 0, retried: 0 };

  for (const row of rows) {
    const notifier = resolve(row.channel as 'telegram' | 'email');
    try {
      if (!notifier) throw new Error(`No ${row.channel} notifier configured`);
      const { message, document } = await render(row);
      if (document) {
        if (!notifier.sendDocument) throw new Error(`${row.channel} cannot send documents`);
        await notifier.sendDocument(message, document);
      } else {
        await notifier.send(message);
      }
      await admin
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
        .eq('id', row.id);
      summary.sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const exhausted = row.attempts >= MAX_NOTIFICATION_ATTEMPTS;
      await admin
        .from('notifications')
        .update({
          status: exhausted ? 'failed' : 'pending',
          last_error: message,
          next_attempt_at: new Date(
            Date.now() + backoffMinutes(row.attempts) * 60_000,
          ).toISOString(),
        })
        .eq('id', row.id);
      if (exhausted) summary.failed++;
      else summary.retried++;
    }
  }
  return summary;
}

export async function listNotifications(db: Db, limit = 200): Promise<NotificationRow[]> {
  const { data, error } = await db
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/** Admin action: put a failed (or stuck) row back in the queue immediately. */
export async function requeueNotification(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from('notifications')
    .update({
      status: 'pending',
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', id);
  if (error) throw error;
}
