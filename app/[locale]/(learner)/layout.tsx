import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/session';

/**
 * The learner canvas. Each page renders the shared shell (band, header, back pill, step
 * segments) itself, because the band holds the page's own title; the layout only guards the
 * session and paints the dot grid behind everything.
 */
export default async function LearnerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireUser(locale);
  return <div className="bg-dotgrid min-h-screen">{children}</div>;
}
