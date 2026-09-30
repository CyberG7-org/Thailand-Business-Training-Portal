import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { InterviewSessionView } from '../session-view';

/** One session under Readiness interviews; the view is shared with a learner's Chatbot history. */
export default async function InterviewDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireStaff(locale);
  const t = await getTranslations('admin.interviews');
  return (
    <InterviewSessionView
      locale={locale}
      id={id}
      back={{ href: '/admin/interviews', label: t('back') }}
    />
  );
}
