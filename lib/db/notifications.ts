import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_NOTIFICATION_ATTEMPTS,
  backoffMinutes,
  examResultMessage,
  type ExamResultPayload,
} from '@/lib/domain/notifications';
import type { Notifier, OutboundMessage } from '@/lib/integrations/notify/types';
import { createSupabaseAdminClient } from './admin';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;
export type NotificationRow = Database['public']['Tables']['notifications']['Row'];

export type NotifierResolver = (channel: 'telegram' | 'email') => Notifier | null;

function renderMessage(row: NotificationRow): OutboundMessage {
  if (row.event_type !== 'exam_result') {
    throw new Error(`Unknown notification event: ${row.event_type}`);
  }
  const { subject, text } = examResultMessage(row.payload as unknown as ExamResultPayload);
  return {
    channel: row.channel as OutboundMessage['channel'],
    destination: row.destination_ref ?? '',
    subject,
    text,
  };
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
      await notifier.send(renderMessage(row));
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
