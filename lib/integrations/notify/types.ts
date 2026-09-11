export type NotificationChannel = 'telegram' | 'email';

export type OutboundMessage = {
  channel: NotificationChannel;
  /** Telegram chat id or email address. */
  destination: string;
  subject: string;
  text: string;
};

export interface Notifier {
  readonly name: string;
  readonly channel: NotificationChannel;
  send(message: OutboundMessage): Promise<void>;
}

export class NotifyError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_configured' | 'provider',
  ) {
    super(message);
    this.name = 'NotifyError';
  }
}
