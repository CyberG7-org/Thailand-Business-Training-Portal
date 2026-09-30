import { useTranslations } from 'next-intl';
import type { RegisteredAddress } from '@/lib/domain/geo/resolve';

const PARTS = [
  'house_no',
  'moo',
  'road',
  'subdistrict',
  'district',
  'province',
  'postcode',
] as const;

/** The registered address as the geography tables read it (spec §5.2): its parts, or why not. */
export function AddressPanel({ address, stored }: { address: RegisteredAddress; stored: boolean }) {
  const t = useTranslations('admin.dbd.address');
  const tone =
    address.status === 'resolved'
      ? 'staff-notice-ok'
      : address.status === 'partial'
        ? 'staff-notice-warn'
        : 'staff-notice-bad';
  return (
    <section
      className="staff-card grid max-w-2xl gap-3"
      data-testid="address-panel"
      data-status={address.status}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className={tone} data-testid="address-status">
        {t(`status.${address.status}` as 'status.resolved')}
      </p>
      {address.issues.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-warn-700" data-testid="address-issues">
          {address.issues.map((issue) => (
            <li key={issue}>{t(`issues.${issue}` as 'issues.no_address')}</li>
          ))}
        </ul>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {PARTS.map((part) => (
          <div key={part} className="contents">
            <dt className="text-ink-500">{t(`parts.${part}` as 'parts.house_no')}</dt>
            <dd data-testid={`address-${part}`}>{address[part] ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {address.postcode_source === 'geography' && (
        <p className="text-sm text-ink-500">{t('postcodeFromGeography')}</p>
      )}
      {!stored && <p className="text-sm text-ink-500">{t('notStoredYet')}</p>}
    </section>
  );
}
