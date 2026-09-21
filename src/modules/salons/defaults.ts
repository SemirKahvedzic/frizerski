import type { WorkingDayInput } from "@/modules/salons/schemas";

/** Mon–Fri 09:00–17:00, Sat 09:00–14:00, Sun closed. */
export function defaultWorkingHours(): WorkingDayInput[] {
  return [
    { weekday: 0, isClosed: false, opensAt: "09:00", closesAt: "17:00" },
    { weekday: 1, isClosed: false, opensAt: "09:00", closesAt: "17:00" },
    { weekday: 2, isClosed: false, opensAt: "09:00", closesAt: "17:00" },
    { weekday: 3, isClosed: false, opensAt: "09:00", closesAt: "17:00" },
    { weekday: 4, isClosed: false, opensAt: "09:00", closesAt: "17:00" },
    { weekday: 5, isClosed: false, opensAt: "09:00", closesAt: "14:00" },
    { weekday: 6, isClosed: true, opensAt: "09:00", closesAt: "17:00" },
  ];
}
