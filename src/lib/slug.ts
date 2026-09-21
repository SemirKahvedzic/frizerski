/**
 * URL slug helpers. Handles Bosnian/Croatian/Serbian diacritics explicitly
 * (č ć đ š ž) before the generic Unicode fold so "Frizerski salon Đurđević"
 * becomes "frizerski-salon-durdevic".
 */
const REPLACEMENTS: Record<string, string> = {
  č: "c",
  ć: "c",
  đ: "dj",
  š: "s",
  ž: "z",
  ß: "ss",
  æ: "ae",
  ø: "o",
  ł: "l",
};

export function slugify(input: string, maxLength = 60): string {
  const lowered = input.trim().toLowerCase();
  let out = "";
  for (const char of lowered) {
    out += REPLACEMENTS[char] ?? char;
  }
  out = out
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (out.length > maxLength) {
    out = out.slice(0, maxLength).replace(/-+$/g, "");
  }
  return out;
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/** Appends `-2`, `-3`, … until `isTaken` reports the candidate as free. */
export async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = base || "salon";
  if (!(await isTaken(root))) return root;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${root.slice(0, 60 - String(n).length - 1)}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${root.slice(0, 40)}-${Date.now().toString(36)}`;
}
