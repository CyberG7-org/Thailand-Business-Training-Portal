'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import type { CompanyStatus } from '@/lib/domain/auto-confirm';
import { DeleteIconForm } from '../delete-icon-form';
import { deleteCompanyAction } from './actions';
import { CreateDbdForm } from './create-dbd-form';

/** One company as the tab lists it, prepared on the server (RLS has narrowed the rows). */
export type CompanyRow = {
  id: string;
  name: string | null;
  director: string | null;
  /** The registration date, already formatted for the reader's language. */
  registeredOn: string | null;
  status: CompanyStatus;
  /** The owning team's code; only the owner, who sees every team, gets the column. */
  teamCode: string | null;
  /**
   * Who studies it (D93: one learner per company): their code, `'other'` when they belong to a
   * team the caller cannot see, or null while it has none.
   */
  learner: { id: string; code: string } | 'other' | null;
};

const TONE: Record<CompanyStatus, string> = {
  confirmed_auto: 'bg-ok-50 text-ok-600',
  confirmed: 'bg-ok-50 text-ok-600',
  reading: 'bg-warn-50 text-warn-700',
  attention: 'bg-warn-50 text-warn-700',
  unread: 'bg-bad-50 text-bad-600',
};

const isConfirmed = (status: CompanyStatus) =>
  status === 'confirmed' || status === 'confirmed_auto';

/**
 * "Companies (DBD)" (D80): every company the caller can see, newest first, where each stands,
 * who studies it, and a search over name and director. A confirmed company without a learner
 * offers "Assign learner" (D93). The creation panel sits before the existing-company list.
 */
export function CompaniesPanel({
  rows,
  showTeam,
  extractionAvailable,
  zipExtractionAvailable,
  addOpen,
  onAddOpenChange,
  onAssign,
}: {
  rows: CompanyRow[];
  showTeam: boolean;
  extractionAvailable: boolean;
  zipExtractionAvailable: boolean;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  /** Opens the learner form with this company chosen. */
  onAssign: (recordId: string) => void;
}) {
  const t = useTranslations('admin.createDbd');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter(
        (r) =>
          (r.name ?? '').toLowerCase().includes(q) || (r.director ?? '').toLowerCase().includes(q),
      )
    : rows;

  return (
    <div className="grid gap-5" data-testid="companies">
      <section
        className="staff-card"
        aria-labelledby="create-company-heading"
        data-testid="create-company-panel"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="create-company-heading">{t('title')}</h2>
            <p className="staff-intro mt-1">{t('addCompanyHint')}</p>
          </div>
          {addOpen && (
            <button
              type="button"
              onClick={() => onAddOpenChange(false)}
              className="staff-btn-ghost staff-btn-sm"
              aria-expanded={true}
            >
              {t('closeAdd')}
            </button>
          )}
        </div>
        {addOpen ? (
          <div id="create-company-form" className="mt-5">
            <CreateDbdForm
              extractionAvailable={extractionAvailable}
              zipExtractionAvailable={zipExtractionAvailable}
              embedded
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onAddOpenChange(true)}
            data-testid="add-company"
            aria-expanded={false}
            className="staff-btn mt-5"
          >
            <span aria-hidden="true">+</span>
            {t('addCompany')}
          </button>
        )}
      </section>

      <section
        className="staff-card overflow-hidden p-0 md:p-0"
        aria-labelledby="companies-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 p-4 md:px-6 md:py-5">
          <div className="max-w-xl">
            <h2 id="companies-heading">{t('companies')}</h2>
            <p className="staff-intro mt-1">{t('companiesIntro')}</p>
          </div>
          {rows.length > 0 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search')}
              aria-label={t('search')}
              data-testid="companies-search"
              className="staff-input md:w-72"
            />
          )}
        </div>

        {rows.length === 0 ? (
          <p className="border-t border-ink-100 px-4 py-6 text-sm text-ink-700 md:px-6">
            {t('noCompanies')}
          </p>
        ) : shown.length === 0 ? (
          <p className="border-t border-ink-100 px-4 py-6 text-sm text-ink-700 md:px-6">
            {t('noMatch', { query })}
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-ink-100 [contain:paint]">
            <table className="staff-table">
              <thead>
                <tr>
                  <th className="md:pl-6">{t('columns.company')}</th>
                  {showTeam && <th>{t('columns.team')}</th>}
                  <th>{t('columns.director')}</th>
                  <th>{t('columns.registeredOn')}</th>
                  <th>{t('columns.status')}</th>
                  <th className="md:pr-6">{t('columns.learner')}</th>
                  <th>
                    <span className="sr-only">{t('columns.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const confirmed = isConfirmed(r.status);
                  return (
                    <tr key={r.id}>
                      <td className="align-middle md:pl-6">
                        <Link
                          href={`/admin/dbd-records/${r.id}`}
                          className={`font-medium underline-offset-4 hover:underline ${
                            confirmed ? 'text-ink-900' : 'text-ink-500'
                          }`}
                        >
                          {r.name ?? t('unnamed')}
                        </Link>
                      </td>
                      {showTeam && (
                        <td className="align-middle" data-testid={`record-team-${r.id}`}>
                          {r.teamCode ?? '—'}
                        </td>
                      )}
                      <td className="align-middle text-ink-700">{r.director ?? '—'}</td>
                      <td className="align-middle whitespace-nowrap">{r.registeredOn ?? '—'}</td>
                      <td className="align-middle">
                        <span
                          data-testid={`company-status-${r.id}`}
                          data-status={r.status}
                          className={`staff-tag text-sm whitespace-nowrap ${TONE[r.status]}`}
                        >
                          {t(`statuses.${r.status}`)}
                        </span>
                      </td>
                      <td className="align-middle md:pr-6" data-testid={`company-learner-${r.id}`}>
                        {r.learner === 'other' ? (
                          <span className="text-sm whitespace-nowrap text-ink-500">
                            {t('learnerOtherTeam')}
                          </span>
                        ) : r.learner ? (
                          <Link
                            href={`/admin/users/${r.learner.id}`}
                            className="staff-link font-mono text-sm whitespace-nowrap tabular-nums"
                          >
                            {r.learner.code}
                          </Link>
                        ) : confirmed ? (
                          <button
                            type="button"
                            onClick={() => onAssign(r.id)}
                            data-testid={`assign-learner-${r.id}`}
                            className="staff-btn-ghost px-4 whitespace-nowrap text-brand-600"
                          >
                            {t('assignLearner')}
                          </button>
                        ) : (
                          <span className="text-sm whitespace-nowrap text-ink-500">
                            {t('learnerAfterConfirm')}
                          </span>
                        )}
                      </td>
                      <td className="align-middle">
                        <DeleteIconForm
                          action={deleteCompanyAction}
                          id={r.id}
                          label={t('deleteCompany')}
                          confirmation={t('deleteCompanyConfirm', { name: r.name ?? t('unnamed') })}
                          testId={`delete-company-${r.id}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
