import { getTranslator, normalizeLocale } from "@/i18n/messages";
import { env } from "@/lib/env";
import { sendEmail } from "@/modules/notifications/email";
import { renderEmailLayout } from "@/modules/notifications/email/templates/layout";

type AuthEmailInput = {
  to: string;
  name: string;
  locale: string | null | undefined;
  url: string;
};

export async function sendVerificationEmail(input: AuthEmailInput): Promise<void> {
  const locale = normalizeLocale(input.locale);
  const t = await getTranslator(locale);
  const appName = env.APP_NAME;

  const { html, text } = renderEmailLayout({
    appName,
    title: t("emails.verify.title"),
    greeting: t("emails.common.greeting", { name: input.name }),
    paragraphs: [t("emails.verify.intro", { appName })],
    button: { label: t("emails.verify.button"), url: input.url },
    footer: [
      t("emails.verify.expires"),
      t("emails.common.ignore"),
      t("emails.common.signature", { appName }),
    ],
  });

  await sendEmail({
    to: input.to,
    subject: t("emails.verify.subject", { appName }),
    html,
    text,
    tags: { type: "auth.verify-email", locale },
  });
}

export async function sendPasswordResetEmail(input: AuthEmailInput): Promise<void> {
  const locale = normalizeLocale(input.locale);
  const t = await getTranslator(locale);
  const appName = env.APP_NAME;

  const { html, text } = renderEmailLayout({
    appName,
    title: t("emails.reset.title"),
    greeting: t("emails.common.greeting", { name: input.name }),
    paragraphs: [t("emails.reset.intro", { appName })],
    button: { label: t("emails.reset.button"), url: input.url },
    footer: [
      t("emails.reset.expires"),
      t("emails.common.ignore"),
      t("emails.common.signature", { appName }),
    ],
  });

  await sendEmail({
    to: input.to,
    subject: t("emails.reset.subject", { appName }),
    html,
    text,
    tags: { type: "auth.reset-password", locale },
  });
}
