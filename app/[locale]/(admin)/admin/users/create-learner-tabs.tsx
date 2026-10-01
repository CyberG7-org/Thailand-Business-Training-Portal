'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type KeyboardEvent } from 'react';
import { CompaniesPanel, type CompanyRow } from './companies-panel';
import { NewUserForm, type CompanyOption, type TeamOption } from './new-user-form';

export type CreateLearnerTab = 'learner' | 'companies';

const TABS: CreateLearnerTab[] = ['learner', 'companies'];

/**
 * "Create learner & DBD" as two tabs (D80): the learner form, and the companies a learner can
 * study. Both stay mounted, so switching never loses what was typed.
 */
export function CreateLearnerTabs({
  companies,
  rows,
  teams,
  ownLoginId,
  initialSuffix,
  extractionAvailable,
  initialTab,
  initialAddOpen,
}: {
  companies: CompanyOption[];
  rows: CompanyRow[];
  teams: TeamOption[] | null;
  ownLoginId: string | null;
  initialSuffix: string | null;
  extractionAvailable: boolean;
  initialTab: CreateLearnerTab;
  initialAddOpen: boolean;
}) {
  const t = useTranslations('admin.users');
  const [tab, setTab] = useState<CreateLearnerTab>(initialTab);
  const [addOpen, setAddOpen] = useState(initialAddOpen);
  const tabRefs = useRef<Record<CreateLearnerTab, HTMLButtonElement | null>>({
    learner: null,
    companies: null,
  });

  // Arrow keys move along the tabs, as a tab list should.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = TABS[(TABS.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % 2];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="grid gap-5">
      <div
        role="tablist"
        aria-label={t('title')}
        onKeyDown={onKeyDown}
        className="inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-card bg-white p-1 shadow-raised"
      >
        {TABS.map((key) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[key] = el;
              }}
              type="button"
              role="tab"
              id={`create-tab-${key}`}
              aria-selected={selected}
              aria-controls={`create-panel-${key}`}
              tabIndex={selected ? 0 : -1}
              data-testid={`tab-${key}`}
              onClick={() => setTab(key)}
              className={`flex min-h-11 items-center gap-2 rounded-control px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
                selected ? 'bg-brand-900 text-white' : 'text-ink-700 hover:bg-ink-50'
              }`}
            >
              {key === 'learner' ? t('tabLearner') : t('tabCompanies')}
              {key === 'companies' && (
                <span
                  className={`rounded-full px-2 text-xs tabular-nums ${
                    selected ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-700'
                  }`}
                >
                  {rows.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="create-panel-learner"
        aria-labelledby="create-tab-learner"
        hidden={tab !== 'learner'}
      >
        <NewUserForm
          companies={companies}
          teams={teams}
          ownLoginId={ownLoginId}
          initialSuffix={initialSuffix}
          onAddCompany={() => {
            setAddOpen(true);
            setTab('companies');
          }}
        />
      </div>

      <div
        role="tabpanel"
        id="create-panel-companies"
        aria-labelledby="create-tab-companies"
        hidden={tab !== 'companies'}
      >
        <CompaniesPanel
          rows={rows}
          showTeam={teams !== null}
          extractionAvailable={extractionAvailable}
          addOpen={addOpen}
          onAddOpenChange={setAddOpen}
        />
      </div>
    </div>
  );
}
