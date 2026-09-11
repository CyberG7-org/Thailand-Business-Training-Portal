import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LOCALES } from '@/i18n/routing';
import { requireAdmin } from '@/lib/auth/session';
import { getQuestion } from '@/lib/db/questions';
import { createSupabaseServerClient } from '@/lib/db/server';
import { ApprovalForm, QuestionForm, QuestionLocalizationForm } from '../question-forms';

export default async function QuestionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireAdmin(locale);
  const question = await getQuestion(await createSupabaseServerClient(), id);
  if (!question) notFound();
  const t = await getTranslations('admin.questions');
  return (
    <section className="grid gap-6">
      <Link href="/admin/questions" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{question.question_key}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <QuestionForm question={question} />
        <ApprovalForm question={question} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {LOCALES.map((language) => (
          <QuestionLocalizationForm
            key={language}
            questionId={question.id}
            language={language}
            localization={
              question.question_localizations.find((l) => l.language === language) ?? null
            }
          />
        ))}
      </div>
    </section>
  );
}
