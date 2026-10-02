'use client';

import { useSearchParams } from 'next/navigation';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { RECORD_TABS, isRecordTab, type RecordTab } from './record-tab-keys';

/**
 * Opens a tab from anywhere on the page, e.g. the status column under the sidebar sending the
 * reader to the open exceptions. The tab lives in the address (`?tab=`); a fresh history state
 * lets the router see the change, so the tabs follow it without a reload.
 */
export function showRecordTab(tab: RecordTab) {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState(null, '', url);
}

/**
 * The company record as tabs (the "Create learner & DBD" look): what is typed lives in four
 * tabs, all mounted so nothing typed is lost when switching, across the page's full width; where
 * the company stands sits under the sidebar (`@side`). The tab is kept in the address, so a
 * reload or a link lands on it.
 */
export function RecordTabs({
  initialTab,
  labels,
  badges,
  panels,
}: {
  initialTab: RecordTab;
  labels: Record<RecordTab, string>;
  badges: Partial<Record<RecordTab, { text: string; warn?: boolean }>>;
  panels: Record<RecordTab, ReactNode>;
}) {
  const fromAddress = useSearchParams().get('tab');
  const tab = isRecordTab(fromAddress) ? fromAddress : initialTab;
  const refs = useRef<Partial<Record<RecordTab, HTMLButtonElement | null>>>({});

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const step = e.key === 'ArrowRight' ? 1 : RECORD_TABS.length - 1;
    const next = RECORD_TABS[(RECORD_TABS.indexOf(tab) + step) % RECORD_TABS.length];
    showRecordTab(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="grid min-w-0 gap-5">
      <div
        role="tablist"
        onKeyDown={onKeyDown}
        className="inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-card bg-white p-1 shadow-raised"
      >
        {RECORD_TABS.map((key) => {
          const selected = tab === key;
          const badge = badges[key];
          return (
            <button
              key={key}
              ref={(el) => {
                refs.current[key] = el;
              }}
              type="button"
              role="tab"
              id={`record-tab-${key}`}
              aria-selected={selected}
              aria-controls={`record-panel-${key}`}
              tabIndex={selected ? 0 : -1}
              data-testid={`record-tab-${key}`}
              onClick={() => showRecordTab(key)}
              className={`flex min-h-11 items-center gap-2 rounded-control px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
                selected ? 'bg-brand-900 text-white' : 'text-ink-700 hover:bg-ink-50'
              }`}
            >
              {labels[key]}
              {badge && (
                <span
                  className={`rounded-full px-2 text-xs tabular-nums ${
                    badge.warn
                      ? 'bg-warn-50 text-warn-700'
                      : selected
                        ? 'bg-white/20 text-white'
                        : 'bg-brand-100 text-brand-700'
                  }`}
                >
                  {badge.text}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {RECORD_TABS.map((key) => (
        <div
          key={key}
          role="tabpanel"
          id={`record-panel-${key}`}
          aria-labelledby={`record-tab-${key}`}
          hidden={tab !== key}
        >
          {/* The grid sits inside, so it can never override `hidden`. */}
          <div className="grid min-w-0 gap-5">{panels[key]}</div>
        </div>
      ))}
    </div>
  );
}
