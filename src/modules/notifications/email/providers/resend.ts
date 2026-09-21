import type {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from "@/modules/notifications/email/types";

export type ResendOptions = { apiKey: string; from: string; endpoint?: string };

/**
 * Resend adapter over its REST API (no SDK dependency). Selected with
 * `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (docs/notifications.md §6).
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(private readonly options: ResendOptions) {
    if (!options.apiKey) throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const response = await fetch(this.options.endpoint ?? "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.options.from,
        to: [message.to],
        reply_to: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content, "utf8").toString("base64"),
          content_type: a.contentType,
        })),
        tags: message.tags
          ? Object.entries(message.tags).map(([name, value]) => ({ name, value }))
          : undefined,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend responded ${response.status}: ${body.slice(0, 300)}`);
    }
    const body = (await response.json()) as { id?: string };
    return { providerMessageId: body.id ?? "" };
  }
}
