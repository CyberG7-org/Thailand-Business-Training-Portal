'use client';

import {
  createContext,
  useContext,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { RECORD_TABS, type RecordTab } from './record-tab-keys';

const OpenTab = createContext<(tab: RecordTab) => void>(() => {});

/** Lets a card in the status column send the reader to a tab, e.g. the open exceptions. */
export const useOpenRecordTab = () => useContext(OpenTab);

/**
 * The company record as tabs (the "Create learner & DBD" look): what is typed lives in four
 * tabs, all mounted so nothing typed is lost when switching, and where the company stands sits in
 * a column beside them — first on a phone. The tab is kept in the address (`?tab=`), so a reload
 * or a link lands on it.
 */
export function RecordTabs({
  initialTab,
  labels,
  badges,
  panels,
  aside,
}: {
  initialTab: RecordTab;
  labels: Record<RecordTab, string>;
  badges: Partial<Record<RecordTab, { text: string; warn?: boolean }>>;
  panels: Record<RecordTab, ReactNode>;
  aside: ReactNode;
}) {
  const [tab, setTabState] = useState<RecordTab>(initialTab);
  const refs = useRef<Partial<Record<RecordTab, HTMLButtonElement | null>>>({});

  const setTab = (next: RecordTab) => {
    setTabState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const step = e.key === 'ArrowRight' ? 1 : RECORD_TABS.length - 1;
    const next = RECORD_TABS[(RECORD_TABS.indexOf(tab) + step) % RECORD_TABS.length];
    setTab(next);
    refs.current[next]?.focus();
  };

  return (
    <OpenTab.Provider value={setTab}>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                  onClick={() => setTab(key)}
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
        <aside className="order-first grid gap-4 lg:sticky lg:top-6 lg:order-none">{aside}</aside>
      </div>
    </OpenTab.Provider>
  );
}
