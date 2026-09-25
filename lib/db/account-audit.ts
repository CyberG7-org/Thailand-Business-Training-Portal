import 'server-only';
import { createSupabaseAdminClient } from './admin';

/**
 * Spec §7: creating a manager, and handing a team to a successor, are recorded in the audit log.
 * `audit_row_change()` is attached to the content tables but never to `profiles`, and adding it
 * would be a schema change this stage deliberately avoids — so the account actions write their
 * own row, with the same `entity_type.action` shape the trigger uses.
 */
export async function recordAccountAction(
  actorId: string,
  action: 'create' | 'rename' | 'status' | 'password',
  userId: string,
  after: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from('audit_logs')
    .insert({
      actor_id: actorId,
      action: `profiles.${action}`,
      entity_type: 'profiles',
      entity_id: userId,
      after: after as never,
    });
  // An unwritten audit row must not fail the action the operator asked for; it is a record of
  // what happened, not part of it.
  if (error) console.error('audit: could not record', action, error.message);
}
