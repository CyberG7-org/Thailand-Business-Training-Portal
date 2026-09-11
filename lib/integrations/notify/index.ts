import 'server-only';
import { ResendEmailNotifier } from './email';
import { FakeNotifier } from './fake';
import { TelegramNotifier } from './telegram';
import type { NotificationChannel, Notifier } from './types';

export type NotifyProviderName = 'live' | 'fake' | 'off';

/**
 * NOTIFY_PROVIDER=live|fake|off. Default: live when a channel key exists, otherwise fake outside
 * production and off in production. Channels without a key are skipped in live mode.
 */
export function resolveNotifyProvider(
  env: Record<string, string | undefined> = process.env,
): NotifyProviderName {
  const configured = env.NOTIFY_PROVIDER;
  if (configured === 'live' || configured === 'fake' || configured === 'off') return configured;
  if (env.TELEGRAM_BOT_TOKEN || env.RESEND_API_KEY) return 'live';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

const fakes: Partial<Record<NotificationChannel, FakeNotifier>> = {};

export function getNotifier(
  channel: NotificationChannel,
  env: Record<string, string | undefined> = process.env,
): Notifier | null {
  switch (resolveNotifyProvider(env)) {
    case 'live':
      if (channel === 'telegram') {
        return env.TELEGRAM_BOT_TOKEN ? new TelegramNotifier(env.TELEGRAM_BOT_TOKEN) : null;
      }
      return env.RESEND_API_KEY
        ? new ResendEmailNotifier(env.RESEND_API_KEY, env.EMAIL_FROM ?? 'portal@example.com')
        : null;
    case 'fake':
      fakes[channel] ??= new FakeNotifier(channel);
      return fakes[channel]!;
    case 'off':
      return null;
  }
}
