import { LearnerShell } from '@/components/shell/learner-shell';
import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth/session';
import { bankGateFor, listMyCallSessions } from '@/lib/db/calls';
import { createSupabaseServerClient } from '@/lib/db/server';
import { resolveVapiProvider } from '@/lib/integrations/vapi';
import { CallPanel } from './call-panel';

export default async function BankCallPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const db = await createSupabaseServerClient();
  const [gate, sessions, t, ts] = await Promise.all([
    bankGateFor(db, user.id),
    listMyCallSessions(db, user.id),
    getTranslations('bankCall'),
    getTranslations('stages'),
  ]);
  const provider = resolveVapiProvider();
  const open =
    gate.status === 'available' || gate.status === 'in_progress' || gate.status === 'done';

  return (
    <LearnerShell title={t('title')} step="bank">
      <section className="grid gap-6">
        <p className="max-w-2xl text-sm text-gray-700">{t('intro')}</p>

        {!open && (
          <p
            data-testid="call-blocked"
            className="max-w-md rounded border border-amber-300 bg-amber-50 p-3 text-sm"
          >
            {gate.reason ? ts(`reasons.${gate.reason}`) : ts(`status.${gate.status}`)}
          </p>
        )}
        {open && provider === 'off' && (
          <p data-testid="call-blocked" className="max-w-md rounded border bg-gray-50 p-3 text-sm">
            {t('errors.not_configured')}
          </p>
        )}
        {open && provider !== 'off' && (
          <>
            <ol className="max-w-2xl list-decimal space-y-1 pl-5 text-sm text-gray-700">
              <li>{t('tips.quiet')}</li>
              <li>{t('tips.microphone')}</li>
              <li>{t('tips.facts')}</li>
            </ol>
            <CallPanel provider={provider} />
          </>
        )}

        {sessions.length > 0 && (
          <div className="grid max-w-2xl gap-2">
            <h2 className="font-semibold">{t('history')}</h2>
            <ul className="grid gap-2" data-testid="call-history">
              {sessions.map((s) => (
                <li key={s.id} className="rounded border p-3 text-sm" data-testid={`call-${s.id}`}>
                  <div className="flex items-center justify-between">
                    <span>{new Date(s.started_at).toLocaleString(locale)}</span>
                    <span data-testid="call-status">{t(`status.${s.status}`)}</span>
                  </div>
                  {s.transcript && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-gray-600">
                        {t('transcript')}
                      </summary>
                      <pre className="mt-2 text-xs whitespace-pre-wrap">{s.transcript}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </LearnerShell>
  );
}
