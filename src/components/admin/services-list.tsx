"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Link, useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";
import { formatDuration, formatMoney } from "@/lib/money";

export type ServiceRow = {
  id: string;
  categoryId: string | null;
  name: string;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  audience: "MALE" | "FEMALE" | "UNISEX";
  isActive: boolean;
  employeeIds: string[];
};

type Props = {
  salonSlug: string;
  services: ServiceRow[];
  categories: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  reorderAction: (input: {
    salonSlug: string;
    ids: string[];
  }) => Promise<ActionResult<{ count: number }>>;
  setActiveAction: (input: {
    salonSlug: string;
    serviceId: string;
    isActive: boolean;
  }) => Promise<ActionResult<{ id: string }>>;
  deleteAction: (input: {
    salonSlug: string;
    serviceId: string;
  }) => Promise<ActionResult<{ id: string }>>;
};

export function ServicesList({
  salonSlug,
  services,
  categories,
  employees,
  reorderAction,
  setActiveAction,
  deleteAction,
}: Props) {
  const t = useTranslations("services");
  const tSalons = useTranslations("salons");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups: { id: string | null; name: string; items: ServiceRow[] }[] = [
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      items: services.filter((s) => s.categoryId === c.id),
    })),
    { id: null, name: t("fields.noCategory"), items: services.filter((s) => !s.categoryId) },
  ].filter((g) => g.items.length > 0);

  async function move(serviceId: string, direction: -1 | 1) {
    const ids = services.map((s) => s.id);
    const index = ids.indexOf(serviceId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setBusy(serviceId);
    const result = await reorderAction({ salonSlug, ids });
    setBusy(null);
    if (!result.ok) setError(result.error.message);
    router.refresh();
  }

  async function toggle(serviceId: string, isActive: boolean) {
    setBusy(serviceId);
    const result = await setActiveAction({ salonSlug, serviceId, isActive });
    setBusy(null);
    if (!result.ok) setError(result.error.message);
    router.refresh();
  }

  async function remove(serviceId: string) {
    setBusy(serviceId);
    const result = await deleteAction({ salonSlug, serviceId });
    setBusy(null);
    if (!result.ok) setError(result.error.message);
    router.refresh();
  }

  const providerNames = (ids: string[]) =>
    ids.map((id) => employees.find((e) => e.id === id)?.name.split(" ")[0] ?? "?").join(", ");

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {groups.map((group) => (
        <section key={group.id ?? "none"}>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {group.name}
          </h2>
          <ul className="divide-y rounded-xl border">
            {group.items.map((service) => (
              <li
                key={service.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
                data-testid={`service-row-${service.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{service.name}</span>
                    {!service.isActive ? (
                      <Badge variant="secondary">{t("badges.inactive")}</Badge>
                    ) : null}
                    {service.audience !== "UNISEX" ? (
                      <Badge variant="outline">{tSalons(`audience.${service.audience}`)}</Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDuration(service.durationMinutes, {
                      h: t("units.h"),
                      min: t("units.min"),
                    })}
                    {service.employeeIds.length > 0
                      ? ` · ${providerNames(service.employeeIds)}`
                      : ` · ${t("noProviders")}`}
                  </div>
                </div>
                <span className="font-semibold tabular-nums">
                  {formatMoney(service.priceCents, service.currency, locale)}
                </span>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={service.isActive}
                    onCheckedChange={(checked) => toggle(service.id, checked)}
                    disabled={busy === service.id}
                    aria-label={`${service.name}: ${t("fields.isActive")}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${t("moveUp")} ${service.name}`}
                    disabled={busy !== null}
                    onClick={() => move(service.id, -1)}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${t("moveDown")} ${service.name}`}
                    disabled={busy !== null}
                    onClick={() => move(service.id, 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${t("edit")} ${service.name}`}
                    render={<Link href={`/admin/${salonSlug}/services/${service.id}`} />}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${t("delete")} ${service.name}`}
                    disabled={busy !== null}
                    onClick={() => remove(service.id)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
