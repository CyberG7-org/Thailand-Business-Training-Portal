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
  /** The certificate's issue date, already formatted for the reader's language. */
  issuedOn: string | null;
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
 * who studies it, and a search over name and juristic ID. A confirmed company without a learner
 * offers "Assign learner" (D93); a company not yet listed is added from the foot of the list,
 * its pack read in the background.
 */
export function CompaniesPanel({
  rows,
  showTeam,
  extractionAvailable,
  addOpen,
  onAddOpenChange,
  onAssign,
}: {
  rows: CompanyRow[];
  showTeam: boolean;
  extractionAvailable: boolean;
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
    <section className="staff-card overflow-hidden p-0 md:p-0" data-testid="companies">
      <div className="flex flex-wrap items-start justify-between gap-4 p-4 md:px-6 md:py-5">
        <div className="max-w-xl">
          <h2>{t('companies')}</h2>
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
                <th>{t('columns.issuedOn')}</th>
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
                    <td className="align-middle whitespace-nowrap">{r.issuedOn ?? '—'}</td>
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

      <div className="border-t border-ink-100 p-4 md:px-6">
        {addOpen ? (
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-ink-900">{t('title')}</h3>
              <button
                type="button"
                onClick={() => onAddOpenChange(false)}
                className="staff-btn-ghost staff-btn-sm"
              >
                {t('closeAdd')}
              </button>
            </div>
            <CreateDbdForm extractionAvailable={extractionAvailable} embedded />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => onAddOpenChange(true)}
              data-testid="add-company"
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-dashed border-brand-600/50 bg-brand-50 px-4 text-sm font-semibold text-brand-600 hover:bg-brand-100"
            >
              <span aria-hidden="true">+</span>
              {t('addCompany')}
            </button>
            <span className="text-sm text-ink-500">{t('addCompanyHint')}</span>
          </div>
        )}
      </div>
    </section>
  );
}
