/**
 * Email provider abstraction (docs/notifications.md §6).
 * Implementations: SMTP (nodemailer, Mailpit in dev), console, fake (tests);
 * Resend is added in the notifications phase.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  /** Free-form metadata for logs/provider tags (never rendered). */
  tags?: Record<string, string>;
};

export type EmailAttachment = { filename: string; content: string; contentType: string };

export type EmailSendResult = {
  providerMessageId: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
