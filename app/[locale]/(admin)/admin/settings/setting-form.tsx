'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { PolicyControl, PolicyFieldKey } from '@/lib/config/policy-schema';
import { updatePolicyAction, type SettingState } from './actions';

const initial: SettingState = { key: null, ok: false, error: null };
const KNOWN_ERRORS = ['required', 'not_a_number', 'unknown_key'];

export function SettingForm({
  policyKey,
  control,
  value,
  updatedAt,
}: {
  policyKey: PolicyFieldKey;
  control: PolicyControl;
  value: string;
  updatedAt: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.settings');
  const [state, formAction, pending] = useActionState(updatePolicyAction, initial);
  const inputClass = 'mt-1 w-full rounded border px-2 py-1';
  return (
    <form
      action={formAction}
      className="grid gap-2 rounded border p-4"
      data-testid={`setting-${policyKey}`}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="key" value={policyKey} />
      <label className="text-sm font-medium">
        {t(`keys.${policyKey}.label`)}
        <span className="block text-xs font-normal text-gray-600">
          {t(`keys.${policyKey}.help`)}
        </span>
        {control.kind === 'number' && (
          <input
            name="value"
            type="number"
            inputMode="numeric"
            min={control.min}
            max={control.max}
            step={1}
            defaultValue={value}
            required={!control.nullable}
            placeholder={control.nullable ? t('unlimited') : undefined}
            className={inputClass}
          />
        )}
        {control.kind === 'boolean' && (
          <select name="value" defaultValue={value} className={inputClass}>
            <option value="true">{t('yes')}</option>
            <option value="false">{t('no')}</option>
          </select>
        )}
        {control.kind === 'enum' && (
          <select name="value" defaultValue={value} className={inputClass}>
            {control.options.map((option) => (
              <option key={option} value={option}>
                {t(`options.${policyKey}.${option}` as 'options.exam_pass_rule.any')}
              </option>
            ))}
          </select>
        )}
        {control.kind === 'list' && (
          <textarea
            name="value"
            rows={3}
            defaultValue={value}
            placeholder={t('listHint')}
            className={inputClass}
          />
        )}
      </label>
      {state.error && (
        <p role="alert" data-testid="setting-error" className="text-sm text-red-700">
          {KNOWN_ERRORS.includes(state.error)
            ? t(`errors.${state.error}` as 'errors.required')
            : state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" data-testid="setting-saved" className="text-sm text-green-700">
          {t('saved')}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {updatedAt ? t('updatedAt', { at: new Date(updatedAt).toLocaleString(locale) }) : ''}
        </span>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {t('save')}
        </button>
      </div>
    </form>
  );
}
