import type { NotificationChannel, Notifier, OutboundDocument, OutboundMessage } from './types';

/** Records messages instead of sending them (dev/tests). */
export class FakeNotifier implements Notifier {
  readonly name = 'fake';
  readonly sent: OutboundMessage[] = [];
  readonly documents: Array<{ message: OutboundMessage; document: OutboundDocument }> = [];

  constructor(
    readonly channel: NotificationChannel,
    private readonly failWith: Error | null = null,
  ) {}

  async send(message: OutboundMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }

  async sendDocument(message: OutboundMessage, document: OutboundDocument): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.documents.push({ message, document });
  }
}
