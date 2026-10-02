'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type KeyboardEvent } from 'react';
import { CompaniesPanel, type CompanyRow } from './companies-panel';
import {
  NewUserForm,
  type CompanyOption,
  type NewUserFormHandle,
  type TeamOption,
} from './new-user-form';

export type CreateLearnerTab = 'learner' | 'companies';

/** In the order a manager works (D93): the company first, then the learner who studies it. */
const TABS: CreateLearnerTab[] = ['companies', 'learner'];

/**
 * "Create learner & DBD" as two tabs (D80): the companies a learner can study, and the learner
 * form. Both stay mounted, so switching never loses what was typed. "Assign learner" on a
 * company opens the learner form with that company chosen.
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
  const form = useRef<NewUserFormHandle>(null);
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
    // One column that never grows past the page: on a phone the companies table scrolls inside
    // its card instead of pushing the page sideways.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
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
          onAssign={(companyId) => {
            form.current?.assign(companyId);
            setTab('learner');
            window.scrollTo({ top: 0 });
          }}
        />
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
          ref={form}
          onAddCompany={() => {
            setAddOpen(true);
            setTab('companies');
          }}
        />
      </div>
    </div>
  );
}
