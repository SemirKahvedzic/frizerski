/**
 * Inline-styled HTML shell shared by every transactional email (auth,
 * invites, booking notifications). Renders HTML and a plain-text twin.
 */
export type EmailDetail = { label: string; value: string };

export type EmailLayoutInput = {
  appName: string;
  title: string;
  greeting?: string;
  paragraphs: string[];
  /** Key/value block (appointment facts). Rendered as a table after the paragraphs. */
  details?: EmailDetail[];
  /** Paragraphs shown after the details block. */
  afterDetails?: string[];
  button?: { label: string; url: string };
  footer: string[];
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const P = 'style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937"';

function paragraphs(items: string[]): string {
  return items.map((p) => `<p ${P}>${escapeHtml(p)}</p>`).join("");
}

export function renderEmailLayout(input: EmailLayoutInput): { html: string; text: string } {
  const detailsHtml =
    input.details && input.details.length > 0
      ? `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:8px 0 20px;border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate">
${input.details
  .map(
    (d, i) =>
      `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;${i > 0 ? "border-top:1px solid #f3f4f6" : ""}">${escapeHtml(d.label)}</td><td style="padding:8px 12px;font-size:14px;color:#111827;${i > 0 ? "border-top:1px solid #f3f4f6" : ""}">${escapeHtml(d.value)}</td></tr>`,
  )
  .join("\n")}
</table>`
      : "";

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
${input.greeting ? `<p ${P}>${escapeHtml(input.greeting)}</p>` : ""}
${paragraphs(input.paragraphs)}
${detailsHtml}
${paragraphs(input.afterDetails ?? [])}
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
    ...(input.details ?? []).map((d) => `${d.label}: ${d.value}`),
    ...(input.details && input.details.length > 0 ? [""] : []),
    ...(input.afterDetails ?? []).flatMap((p) => [p, ""]),
    ...(input.button ? [`${input.button.label}: ${input.button.url}`, ""] : []),
    "--",
    ...input.footer,
  ].join("\n");

  return { html, text };
}
