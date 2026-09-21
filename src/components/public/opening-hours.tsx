import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type Day = { weekday: number; isClosed: boolean; opensAt: string; closesAt: string };

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function OpeningHours({ days, todayWeekday }: { days: Day[]; todayWeekday: number }) {
  const tDays = useTranslations("weekdays");
  const t = useTranslations("publicSalon");

  return (
    <ul className="divide-y text-sm">
      {days.map((day) => {
        const isToday = day.weekday === todayWeekday;
        return (
          <li
            key={day.weekday}
            className={cn("flex items-center justify-between py-2", isToday && "font-semibold")}
            data-testid={`public-hours-${WEEKDAY_KEYS[day.weekday]}`}
          >
            <span>
              {tDays(WEEKDAY_KEYS[day.weekday] ?? "mon")}
              {isToday ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">{t("today")}</span>
              ) : null}
            </span>
            <span className={cn(day.isClosed && "text-muted-foreground")}>
              {day.isClosed ? t("closed") : `${day.opensAt} – ${day.closesAt}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
