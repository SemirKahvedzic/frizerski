import { describe, expect, it } from "vitest";

import {
  assignColumns,
  monthGrid,
  percent,
  shiftDate,
  visibleRange,
  weekOf,
  weekdayOf,
} from "@/components/calendar/layout";

describe("calendar layout", () => {
  it("assigns side-by-side columns to overlapping items only", () => {
    const items = [
      { id: "a", startMin: 540, endMin: 600 },
      { id: "b", startMin: 570, endMin: 630 },
      { id: "c", startMin: 600, endMin: 660 },
      { id: "d", startMin: 720, endMin: 780 },
    ];
    const out = assignColumns(items);
    const byId = Object.fromEntries(out.map((o) => [o.id, o]));
    expect(byId["a"]).toMatchObject({ col: 0, cols: 2 });
    expect(byId["b"]).toMatchObject({ col: 1, cols: 2 });
    expect(byId["c"]).toMatchObject({ col: 0, cols: 2 });
    expect(byId["d"]).toMatchObject({ col: 0, cols: 1 });
  });

  it("computes Monday-start weeks and six-row month grids", () => {
    expect(weekdayOf("2026-10-10")).toBe(5);
    expect(weekOf("2026-10-10")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    const grid = monthGrid("2026-10-10");
    expect(grid).toHaveLength(6);
    expect(grid[0]![0]).toBe("2026-09-28");
    expect(grid[5]![6]).toBe("2026-11-08");
    expect(visibleRange("2026-10-10", "month")).toEqual({ from: "2026-09-28", to: "2026-11-08" });
    expect(visibleRange("2026-10-10", "day")).toEqual({ from: "2026-10-10", to: "2026-10-10" });
  });

  it("shifts dates per view and maps minutes to percentages", () => {
    expect(shiftDate("2026-10-10", "day", 1)).toBe("2026-10-11");
    expect(shiftDate("2026-10-10", "week", -1)).toBe("2026-10-03");
    expect(shiftDate("2026-10-31", "month", 1)).toBe("2026-11-01");
    expect(percent(600, 480, 1200)).toBeCloseTo(16.67, 1);
    expect(percent(400, 480, 1200)).toBe(0);
  });
});
