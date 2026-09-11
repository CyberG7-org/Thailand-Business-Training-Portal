import 'server-only';
import { NotifyError, type Notifier, type OutboundMessage } from './types';

/** Telegram Bot API `sendMessage` (and later `sendDocument` for name cards). */
export class TelegramNotifier implements Notifier {
  readonly name = 'telegram';
  readonly channel = 'telegram' as const;

  constructor(private readonly botToken: string) {}

  async send(message: OutboundMessage): Promise<void> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.destination,
        text: `${message.subject}\n\n${message.text}`,
        disable_web_page_preview: true,
      }),
    });
    if (response.status === 401)
      throw new NotifyError('Telegram bot token rejected', 'not_configured');
    if (!response.ok) {
      throw new NotifyError(
        `Telegram error ${response.status}: ${await response.text()}`,
        'provider',
      );
    }
  }
}
