import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { LanguageToggle } from '@/components/language-toggle';
import { getCurrentUser, homePathFor } from '@/lib/auth/session';
import { STAGE_KEYS } from '@/lib/domain/progression';
import { LoginForm } from './login-form';

const rise = (delay: string) => ({ '--rise-delay': delay }) as CSSProperties;

/**
 * Sign-in (design handoff, Login): the navy panel with the skyline photo, the portal's name and
 * the five steps on the left; the form card on the right. On a phone the panel becomes a band
 * and the card overlaps it.
 */
export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { locale } = await params;
  const { reason } = await searchParams;
  const user = await getCurrentUser();
  if (user && user.status === 'active') {
    redirect(homePathFor(user.role, locale));
  }
  const [t, ta, th, ts] = await Promise.all([
    getTranslations('auth'),
    getTranslations('app'),
    getTranslations('home'),
    getTranslations('stages'),
  ]);
  const name = ta('name');
  const thaiName = ta('nameThai');

  return (
    <main className="bg-dotgrid relative min-h-screen lg:grid lg:grid-cols-[560px_minmax(0,1fr)]">
      {/* One language control for both layouts: in the band's top row on a phone, top-right of
          the form column on a desktop. */}
      <div className="absolute top-4 right-5 z-10 lg:top-8 lg:right-10">
        <LanguageToggle label={ta('language')} tone="login" />
      </div>

      <section className="relative flex flex-col overflow-hidden rounded-b-[28px] bg-brand-900 px-5 pt-4 pb-14 text-white lg:rounded-none lg:rounded-r-[36px] lg:px-12 lg:py-10">
        <Image
          src="/images/login/photo-skyline.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 560px, 100vw"
          className="object-cover"
        />
        <div aria-hidden="true" className="scrim-hero absolute inset-0" />
        <div className="relative flex flex-1 flex-col">
          <div className="flex items-center gap-3 pr-[180px] sm:pr-[240px] lg:pr-0">
            <span
              aria-hidden="true"
              className="grid size-[38px] shrink-0 place-items-center rounded-[9px] bg-brand-900 font-display text-[15px] font-semibold text-gold-100 shadow-[inset_0_0_0_1px_rgb(200_150_62/0.7)] lg:size-11 lg:rounded-[10px] lg:text-[17px]"
            >
              BT
            </span>
            <span className="flex flex-col leading-[1.4]">
              <span className="font-display text-base font-semibold lg:text-[17px]">{name}</span>
              {thaiName !== name && (
                <span className="hidden text-sm text-brand-100 lg:inline">{thaiName}</span>
              )}
            </span>
          </div>

          <div className="mt-7 lg:my-auto">
            <h1
              className="rise font-display text-2xl leading-[1.7] font-medium text-balance lg:text-4xl lg:leading-[1.35]"
              style={rise('0ms')}
            >
              {th('title')}
            </h1>
            <p
              className="rise mt-1.5 text-sm leading-[1.7] text-pretty text-brand-100 lg:mt-3.5 lg:max-w-[440px] lg:text-base lg:leading-[1.75]"
              style={rise('60ms')}
            >
              {th('description')}
            </p>
            <ol
              data-testid="login-stages"
              className="rise relative mt-8 hidden flex-col gap-3.5 lg:flex"
              style={rise('120ms')}
            >
              <span
                aria-hidden="true"
                className="absolute top-4 bottom-4 left-[15px] w-0.5 bg-white/20"
              />
              {STAGE_KEYS.map((key, i) => (
                <li
                  key={key}
                  className="relative flex items-center gap-3.5 text-base leading-[1.6]"
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                      i === STAGE_KEYS.length - 1
                        ? 'bg-gold-500 text-brand-900'
                        : 'border border-white/35 bg-brand-700'
                    }`}
                  >
                    {i + 1}
                  </span>
                  {ts(`titles.${key}`)}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="relative flex flex-col px-4 pb-8 lg:px-10 lg:pt-24 lg:pb-8">
        <div className="-mt-8 flex flex-1 items-start justify-center lg:mt-0 lg:items-center">
          <LoginForm
            labels={{
              title: t('title'),
              hint: t('hint'),
              loginId: t('loginId'),
              password: t('password'),
              submit: t('submit'),
              invalid: t('invalidCredentials'),
              disabled: t('accountDisabled'),
              showPassword: t('showPassword'),
              hidePassword: t('hidePassword'),
            }}
            initialError={reason === 'disabled' ? 'disabled' : null}
          />
        </div>
      </section>
    </main>
  );
}
