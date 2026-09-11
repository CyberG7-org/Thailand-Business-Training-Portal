import 'server-only';
import { NotifyError, type Notifier, type OutboundDocument, type OutboundMessage } from './types';

/** Telegram Bot API: `sendMessage` for text, `sendDocument` for PDFs (name cards). */
export class TelegramNotifier implements Notifier {
  readonly name = 'telegram';
  readonly channel = 'telegram' as const;

  constructor(private readonly botToken: string) {}

  private async check(response: Response): Promise<void> {
    if (response.status === 401) {
      throw new NotifyError('Telegram bot token rejected', 'not_configured');
    }
    if (!response.ok) {
      throw new NotifyError(
        `Telegram error ${response.status}: ${await response.text()}`,
        'provider',
      );
    }
  }

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
    await this.check(response);
  }

  async sendDocument(message: OutboundMessage, document: OutboundDocument): Promise<void> {
    const form = new FormData();
    form.set('chat_id', message.destination);
    form.set('caption', `${message.subject}\n\n${message.text}`.slice(0, 1000));
    form.set(
      'document',
      new Blob([new Uint8Array(document.bytes)], { type: document.contentType }),
      document.filename,
    );
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    await this.check(response);
  }
}
