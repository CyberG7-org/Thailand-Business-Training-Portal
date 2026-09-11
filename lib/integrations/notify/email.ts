import 'server-only';
import { NotifyError, type Notifier, type OutboundMessage } from './types';

/** Resend transactional email over REST. */
export class ResendEmailNotifier implements Notifier {
  readonly name = 'resend';
  readonly channel = 'email' as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: OutboundMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [message.destination],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (response.status === 401 || response.status === 403) {
      throw new NotifyError('Resend API key rejected', 'not_configured');
    }
    if (!response.ok) {
      throw new NotifyError(
        `Resend error ${response.status}: ${await response.text()}`,
        'provider',
      );
    }
  }
}
