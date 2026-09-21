/**
 * Half-open interval algebra on UTC instants: [start, end).
 * Pure, allocation-light, used by the availability engine.
 */
export type Interval = { start: Date; end: Date };

export function isEmpty(i: Interval): boolean {
  return i.end.getTime() <= i.start.getTime();
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Sorts by start and merges overlapping/touching intervals; drops empty ones. */
export function normalize(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => !isEmpty(i))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start.getTime() <= last.end.getTime()) {
      if (i.end.getTime() > last.end.getTime()) last.end = i.end;
    } else {
      out.push({ start: i.start, end: i.end });
    }
  }
  return out;
}

/** `base` minus every interval in `cuts`. */
export function subtract(base: Interval[], cuts: Interval[]): Interval[] {
  const normalizedCuts = normalize(cuts);
  let result = normalize(base);
  for (const cut of normalizedCuts) {
    const next: Interval[] = [];
    for (const i of result) {
      if (!overlaps(i, cut)) {
        next.push(i);
        continue;
      }
      if (i.start.getTime() < cut.start.getTime()) next.push({ start: i.start, end: cut.start });
      if (cut.end.getTime() < i.end.getTime()) next.push({ start: cut.end, end: i.end });
    }
    result = next;
  }
  return result;
}

export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of normalize(a)) {
    for (const y of normalize(b)) {
      const start = new Date(Math.max(x.start.getTime(), y.start.getTime()));
      const end = new Date(Math.min(x.end.getTime(), y.end.getTime()));
      if (end.getTime() > start.getTime()) out.push({ start, end });
    }
  }
  return normalize(out);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function contains(outer: Interval, inner: Interval): boolean {
  return (
    outer.start.getTime() <= inner.start.getTime() && inner.end.getTime() <= outer.end.getTime()
  );
}
