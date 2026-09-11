import type { NotificationChannel, Notifier, OutboundMessage } from './types';

/** Records messages instead of sending them (dev/tests). */
export class FakeNotifier implements Notifier {
  readonly name = 'fake';
  readonly sent: OutboundMessage[] = [];

  constructor(
    readonly channel: NotificationChannel,
    private readonly failWith: Error | null = null,
  ) {}

  async send(message: OutboundMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }
}
