export type NotificationChannel = 'telegram' | 'email';

export type OutboundMessage = {
  channel: NotificationChannel;
  /** Telegram chat id or email address. */
  destination: string;
  subject: string;
  text: string;
};

export type OutboundDocument = { filename: string; contentType: string; bytes: Uint8Array };

export interface Notifier {
  readonly name: string;
  readonly channel: NotificationChannel;
  send(message: OutboundMessage): Promise<void>;
  /** Channels that can carry an attachment (Telegram sendDocument). */
  sendDocument?(message: OutboundMessage, document: OutboundDocument): Promise<void>;
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
