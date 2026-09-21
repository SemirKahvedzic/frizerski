import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  ConsoleEmailProvider,
  FakeEmailProvider,
} from "@/modules/notifications/email/providers/memory";
import { ResendEmailProvider } from "@/modules/notifications/email/providers/resend";
import { SmtpEmailProvider } from "@/modules/notifications/email/providers/smtp";
import type { EmailMessage, EmailProvider } from "@/modules/notifications/email/types";

const globalForEmail = globalThis as unknown as { __emailProvider?: EmailProvider };

function createFromEnv(): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case "smtp":
      return new SmtpEmailProvider({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.EMAIL_FROM,
      });
    case "resend":
      return new ResendEmailProvider({ apiKey: env.RESEND_API_KEY ?? "", from: env.EMAIL_FROM });
    case "console":
      return new ConsoleEmailProvider();
    case "fake":
      return new FakeEmailProvider();
  }
}

export function getEmailProvider(): EmailProvider {
  if (!globalForEmail.__emailProvider) {
    globalForEmail.__emailProvider = createFromEnv();
  }
  return globalForEmail.__emailProvider;
}

/** Swap the provider (tests, or a per-tenant provider later). */
export function setEmailProvider(provider: EmailProvider | undefined): void {
  globalForEmail.__emailProvider = provider;
}

/** Sends through the configured provider; failures are logged and re-thrown. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const provider = getEmailProvider();
  try {
    const result = await provider.send(message);
    logger.info(
      {
        provider: provider.name,
        to: message.to,
        subject: message.subject,
        id: result.providerMessageId,
        tags: message.tags,
      },
      "email sent",
    );
  } catch (error) {
    logger.error(
      { err: error, provider: provider.name, to: message.to, subject: message.subject },
      "email failed",
    );
    throw error;
  }
}

export { FakeEmailProvider, ConsoleEmailProvider, SmtpEmailProvider };
export type { EmailMessage, EmailProvider };
