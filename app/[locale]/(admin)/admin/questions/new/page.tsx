import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { QuestionForm } from '../question-forms';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('admin.nav', 'questions');

export default async function NewQuestionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAdmin(locale);
  const t = await getTranslations('admin.questions');
  return (
    <section className="grid gap-4">
      <h1 className="staff-title">{t('new')}</h1>
      <QuestionForm question={null} />
    </section>
  );
}
