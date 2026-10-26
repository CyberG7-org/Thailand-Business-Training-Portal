import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/**
 * A page's browser-tab title from a label it already shows (sidebar item, stage name). The locale
 * layout's template adds the viewer's role: "Dashboard · Owner".
 */
export function pageTitle(namespace: string, key: string) {
  return async ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> => {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace });
    return { title: t(key) };
  };
}
