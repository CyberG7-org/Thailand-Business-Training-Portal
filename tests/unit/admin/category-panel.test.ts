import { createElement, type ComponentProps, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { CategoryPanel } from '@/app/[locale]/(admin)/admin/dbd-records/[id]/category-panel';
import { manualCategory } from '@/lib/domain/business-category';
import messages from '@/messages/en.json';

type ProviderProps = Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'> & {
  children?: ComponentProps<typeof NextIntlClientProvider>['children'];
};
const Provider = NextIntlClientProvider as ComponentType<ProviderProps>;

describe('CategoryPanel', () => {
  it('shows numbered category options in English alphabetical order without changing their keys', () => {
    const html = renderToStaticMarkup(
      createElement(
        Provider,
        { locale: 'en', messages, timeZone: 'Asia/Bangkok' },
        createElement(CategoryPanel, {
          recordId: 'record-1',
          assignment: null,
          options: [
            { key: 'food', label: 'Food Products' },
            { key: 'auto', label: 'Automotive Parts' },
            { key: 'beauty', label: 'Beauty Products' },
          ],
        }),
      ),
    );
    const options = [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(
      ([, key, label]) => [key, label],
    );
    expect(options).toEqual([
      ['', 'Choose…'],
      ['auto', '01. Automotive Parts'],
      ['beauty', '02. Beauty Products'],
      ['food', '03. Food Products'],
    ]);
  });

  it('marks the saved category in the open dropdown while preserving its selected value', () => {
    const html = renderToStaticMarkup(
      createElement(
        Provider,
        { locale: 'en', messages, timeZone: 'Asia/Bangkok' },
        createElement(CategoryPanel, {
          recordId: 'record-1',
          assignment: manualCategory('beauty', null, '2026-10-15T00:00:00.000Z'),
          options: [
            { key: 'food', label: 'Food Products' },
            { key: 'beauty', label: 'Beauty Products' },
          ],
        }),
      ),
    );
    expect(html).toMatch(/<option value="beauty" selected="">✓ 01\. Beauty Products<\/option>/);
    expect(html).toContain('<option value="food">02. Food Products</option>');
  });
});
