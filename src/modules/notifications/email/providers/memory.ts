import { logger } from "@/lib/logger";
import type {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from "@/modules/notifications/email/types";

/** Records every message in memory. Used by tests. */
export class FakeEmailProvider implements EmailProvider {
  readonly name = "fake";
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(message);
    return { providerMessageId: `fake-${this.sent.length}` };
  }

  /** Last message sent to an address, if any. */
  lastTo(address: string): EmailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to.toLowerCase() === address.toLowerCase());
  }

  reset(): void {
    this.sent.length = 0;
  }
}

/** Logs the message instead of sending it. Handy when no SMTP is available. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async send(message: EmailMessage): Promise<EmailSendResult> {
    logger.info(
      { to: message.to, subject: message.subject, text: message.text, tags: message.tags },
      "email (console provider)",
    );
    return { providerMessageId: `console-${Date.now()}` };
  }
}
