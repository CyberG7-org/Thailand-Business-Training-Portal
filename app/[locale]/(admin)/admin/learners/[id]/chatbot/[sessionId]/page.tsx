import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { InterviewSessionView } from '../../../../interviews/session-view';

/**
 * One Chatbot session in full (D82): the verdict, the officer's narrative, every assessment and
 * the whole conversation — the view Readiness interviews uses, reached from the learner's history.
 */
export default async function ChatbotReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; sessionId: string }>;
}) {
  const { locale, id, sessionId } = await params;
  await requireStaff(locale);
  const t = await getTranslations('admin.learners');
  return (
    <InterviewSessionView
      locale={locale}
      id={sessionId}
      learnerId={id}
      back={{ href: `/admin/learners/${id}/chatbot`, label: t('chatbot.backToHistory') }}
    />
  );
}
