import { getTranslator, normalizeLocale } from "@/i18n/messages";
import { env } from "@/lib/env";
import { sendEmail } from "@/modules/notifications/email";
import { renderEmailLayout } from "@/modules/notifications/email/templates/layout";

export async function sendEmployeeInviteEmail(input: {
  to: string;
  name: string;
  locale: string | null | undefined;
  salonName: string;
  url: string;
}): Promise<void> {
  const locale = normalizeLocale(input.locale);
  const t = await getTranslator(locale);
  const appName = env.APP_NAME;

  const { html, text } = renderEmailLayout({
    appName,
    title: t("emails.invite.title", { salon: input.salonName }),
    greeting: t("emails.common.greeting", { name: input.name }),
    paragraphs: [t("emails.invite.intro", { salon: input.salonName, appName })],
    button: { label: t("emails.invite.button"), url: input.url },
    footer: [t("emails.common.ignore"), t("emails.common.signature", { appName })],
  });

  await sendEmail({
    to: input.to,
    subject: t("emails.invite.subject", { salon: input.salonName }),
    html,
    text,
    tags: { type: "employee.invite", locale },
  });
}
