import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { formatDuration, formatMoney } from "@/lib/money";

type Service = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  audience: "MALE" | "FEMALE" | "UNISEX";
};

type Category = { id: string; name: string };

export function PriceList({
  services,
  categories,
}: {
  services: Service[];
  categories: Category[];
}) {
  const t = useTranslations("publicSalon");
  const tServices = useTranslations("services");
  const locale = useLocale();

  const groups = [
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      items: services.filter((s) => s.categoryId === c.id),
    })),
    { id: "none", name: t("otherServices"), items: services.filter((s) => !s.categoryId) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6" data-testid="price-list">
      {groups.map((group) => (
        <div key={group.id}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {group.name}
          </h3>
          <ul className="divide-y rounded-xl border">
            {group.items.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {s.name}
                    {s.audience !== "UNISEX" ? (
                      <Badge variant="outline" className="text-[10px]">
                        {t(`audience.${s.audience}`)}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDuration(s.durationMinutes, {
                      h: tServices("units.h"),
                      min: tServices("units.min"),
                    })}
                    {s.description ? ` · ${s.description}` : ""}
                  </div>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatMoney(s.priceCents, s.currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
