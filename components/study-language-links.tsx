import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { STUDY_LANGUAGES, type StudyLanguage } from '@/lib/content/bank-interview-cards';

const LABELS: Record<StudyLanguage, string> = {
  th: 'ไทย',
  en: 'English',
  zh: '简体中文',
  ms: 'Bahasa Melayu',
  ta: 'தமிழ்',
};

export function StudyLanguageLinks({ path, language }: { path: string; language: StudyLanguage }) {
  const t = useTranslations('app');
  return (
    <nav
      aria-label={t('language')}
      className="flex flex-wrap gap-2 rounded-card bg-white p-3 shadow-glass"
    >
      {STUDY_LANGUAGES.map((option) => (
        <Link
          key={option}
          href={`${path}?language=${option}`}
          aria-current={option === language ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-600 ${option === language ? 'bg-brand-900 text-white' : 'text-brand-700 hover:bg-brand-50'}`}
        >
          {LABELS[option]}
        </Link>
      ))}
    </nav>
  );
}
