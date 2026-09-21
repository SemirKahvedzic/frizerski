/**
 * Minimal RFC 5545 event for confirmation / reschedule emails. Pure.
 */
export type IcsEventInput = {
  uid: string;
  /** Sequence bumps on every reschedule so calendars replace the old event. */
  sequence: number;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  stamp?: Date;
  cancelled?: boolean;
};

function utc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds long lines at 75 octets as the spec requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function renderIcs(input: IcsEventInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bookly//Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.cancelled ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${utc(input.stamp ?? new Date())}`,
    `DTSTART:${utc(input.startsAt)}`,
    `DTEND:${utc(input.endsAt)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    ...(input.description ? [`DESCRIPTION:${escapeIcsText(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    ...(input.url ? [`URL:${input.url}`] : []),
    `STATUS:${input.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
