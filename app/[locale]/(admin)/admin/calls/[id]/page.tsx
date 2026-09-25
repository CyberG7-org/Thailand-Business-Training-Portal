import { displayLoginId } from '@/lib/domain/login-id';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { createRecordingUrl, getCallSession } from '@/lib/db/calls';
import { createSupabaseServerClient } from '@/lib/db/server';

export default async function AdminCallPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireStaff(locale);
  const session = await getCallSession(await createSupabaseServerClient(), id);
  if (!session) notFound();
  const recordingUrl = session.recording_path
    ? await createRecordingUrl(session.recording_path)
    : null;
  const meta = (session.metadata as Record<string, unknown> | null) ?? {};
  const t = await getTranslations('admin.calls');
  return (
    <section className="grid max-w-3xl gap-4">
      <Link href="/admin/calls" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('detailTitle')}</h1>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-gray-600">{t('learner')}</dt>
        <dd>{session.profiles.display_name ?? displayLoginId(session.profiles.login_id)}</dd>
        <dt className="text-gray-600">{t('company')}</dt>
        <dd>{session.dbd_records?.company_name_th ?? '—'}</dd>
        <dt className="text-gray-600">{t('modality')}</dt>
        <dd>{session.modality}</dd>
        <dt className="text-gray-600">{t('status')}</dt>
        <dd data-testid="admin-call-status">{session.status}</dd>
        <dt className="text-gray-600">{t('started')}</dt>
        <dd>{new Date(session.started_at).toLocaleString(locale)}</dd>
        <dt className="text-gray-600">{t('ended')}</dt>
        <dd>{session.ended_at ? new Date(session.ended_at).toLocaleString(locale) : '—'}</dd>
        <dt className="text-gray-600">{t('endedReason')}</dt>
        <dd>{typeof meta.ended_reason === 'string' ? meta.ended_reason : '—'}</dd>
        <dt className="text-gray-600">{t('providerCallId')}</dt>
        <dd className="font-mono text-xs">{session.vapi_call_id ?? '—'}</dd>
      </dl>
      <div className="grid gap-2">
        <h2 className="font-semibold">{t('recording')}</h2>
        {recordingUrl ? (
          <audio controls src={recordingUrl} data-testid="recording-player" className="w-full" />
        ) : (
          <p className="text-sm text-gray-600">{t('noRecording')}</p>
        )}
      </div>
      <div className="grid gap-2">
        <h2 className="font-semibold">{t('transcript')}</h2>
        {session.transcript ? (
          <pre
            className="rounded border p-3 text-sm whitespace-pre-wrap"
            data-testid="admin-transcript"
          >
            {session.transcript}
          </pre>
        ) : (
          <p className="text-sm text-gray-600">{t('noTranscript')}</p>
        )}
      </div>
    </section>
  );
}
