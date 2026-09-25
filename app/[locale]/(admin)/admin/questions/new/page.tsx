import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { QuestionForm } from '../question-forms';

export default async function NewQuestionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStaff(locale);
  const t = await getTranslations('admin.questions');
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('new')}</h1>
      <QuestionForm question={null} />
    </section>
  );
}
