/**
 * Pure layout helpers for the admin calendar. Dates are local "YYYY-MM-DD"
 * strings in the salon time zone; times are minutes since local midnight.
 */
export type TimedItem = { startMin: number; endMin: number };

export type Positioned<T> = T & { col: number; cols: number };

/**
 * Assigns side-by-side columns to overlapping items (interval graph
 * colouring). Items in one overlap cluster share the same `cols` count so
 * widths line up.
 */
export function assignColumns<T extends TimedItem>(items: T[]): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Positioned<T>[] = [];
  let cluster: Positioned<T>[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];

  const flush = () => {
    const cols = columnEnds.length;
    for (const item of cluster) item.cols = cols;
    out.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush();
    let col = columnEnds.findIndex((end) => end <= item.startMin);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(item.endMin);
    } else {
      columnEnds[col] = item.endMin;
    }
    cluster.push({ ...item, col, cols: 0 });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (cluster.length > 0) flush();
  return out;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday (0 = Monday) of a local date string. */
export function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

/** The Monday-start week containing `date`. */
export function weekOf(date: string): string[] {
  const monday = addDays(date, -weekdayOf(date));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Weeks (Monday-start) covering the month of `date`; always 6 rows for a stable grid. */
export function monthGrid(date: string): string[][] {
  const first = `${date.slice(0, 7)}-01`;
  const start = addDays(first, -weekdayOf(first));
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)),
  );
}

export function shiftDate(date: string, view: "day" | "week" | "month", direction: -1 | 1): string {
  if (view === "day") return addDays(date, direction);
  if (view === "week") return addDays(date, 7 * direction);
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + direction);
  return d.toISOString().slice(0, 10);
}

/** Visible range [from, to] in local dates for a view anchored at `date`. */
export function visibleRange(
  date: string,
  view: "day" | "week" | "month",
): { from: string; to: string } {
  if (view === "day") return { from: date, to: date };
  if (view === "week") {
    const week = weekOf(date);
    return { from: week[0]!, to: week[6]! };
  }
  const grid = monthGrid(date);
  return { from: grid[0]![0]!, to: grid[5]![6]! };
}

export function percent(min: number, dayStart: number, dayEnd: number): number {
  const span = Math.max(1, dayEnd - dayStart);
  return Math.min(100, Math.max(0, ((min - dayStart) / span) * 100));
}
