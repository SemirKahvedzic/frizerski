/**
 * Minimal, inline-styled HTML shell for transactional emails. Rich
 * react-email templates arrive with the notifications phase; auth emails
 * only need a heading, a paragraph, one button and a footer.
 */
export type EmailLayoutInput = {
  appName: string;
  title: string;
  greeting?: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  footer: string[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmailLayout(input: EmailLayoutInput): { html: string; text: string } {
  const paragraphsHtml = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937">${escapeHtml(p)}</p>`,
    )
    .join("");

  const buttonHtml = input.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(input.button.url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600">${escapeHtml(input.button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#6b7280;word-break:break-all">${escapeHtml(input.button.url)}</p>`
    : "";

  const footerHtml = input.footer
    .map(
      (f) =>
        `<p style="margin:0 0 6px;font-size:12px;line-height:18px;color:#9ca3af">${escapeHtml(f)}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f4;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-size:14px;font-weight:600;letter-spacing:.04em;color:#6b7280;text-transform:uppercase">${escapeHtml(input.appName)}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#111827">${escapeHtml(input.title)}</h1>
${input.greeting ? `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937">${escapeHtml(input.greeting)}</p>` : ""}
${paragraphsHtml}
${buttonHtml}
<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0" />
${footerHtml}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text = [
    input.appName,
    "",
    input.title,
    "",
    ...(input.greeting ? [input.greeting, ""] : []),
    ...input.paragraphs.flatMap((p) => [p, ""]),
    ...(input.button ? [`${input.button.label}: ${input.button.url}`, ""] : []),
    ...input.footer,
  ].join("\n");

  return { html, text };
}
