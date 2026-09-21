"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { useServerAction } from "@/components/forms/use-server-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";

export type BreakValue = { startTime: string; endTime: string; label: string | null };
export type BlockValue = {
  key: string;
  weekday: number;
  startTime: string;
  endTime: string;
  breaks: BreakValue[];
};

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

let counter = 0;
const nextKey = () => `b${Date.now().toString(36)}${(counter += 1)}`;

type Props = {
  salonSlug: string;
  employeeId: string;
  initial: { weekday: number; startTime: string; endTime: string; breaks: BreakValue[] }[];
  salonHours: { weekday: number; isClosed: boolean; opensAt: string; closesAt: string }[];
  action: (input: unknown) => Promise<ActionResult<{ count: number }>>;
};

export function ScheduleEditor({ salonSlug, employeeId, initial, salonHours, action }: Props) {
  const t = useTranslations("employees.schedule");
  const tDays = useTranslations("weekdays");
  const router = useRouter();
  const [blocks, setBlocks] = useState<BlockValue[]>(
    initial.map((b) => ({ ...b, key: nextKey() })),
  );
  const { run, pending, fieldErrors, formError, success } = useServerAction(action, {
    onSuccess: () => router.refresh(),
  });

  function addBlock(weekday: number) {
    const hours = salonHours.find((h) => h.weekday === weekday);
    const existing = blocks.filter((b) => b.weekday === weekday);
    const start =
      existing.length > 0 ? existing[existing.length - 1]!.endTime : (hours?.opensAt ?? "09:00");
    const end = hours && !hours.isClosed && hours.closesAt > start ? hours.closesAt : "17:00";
    setBlocks((prev) => [
      ...prev,
      { key: nextKey(), weekday, startTime: start, endTime: end, breaks: [] },
    ]);
  }

  function updateBlock(key: string, patch: Partial<BlockValue>) {
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  function removeBlock(key: string) {
    setBlocks((prev) => prev.filter((b) => b.key !== key));
  }

  function addBreak(key: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.key === key
          ? { ...b, breaks: [...b.breaks, { startTime: "13:00", endTime: "13:30", label: null }] }
          : b,
      ),
    );
  }

  function updateBreak(key: string, index: number, patch: Partial<BreakValue>) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.key === key
          ? { ...b, breaks: b.breaks.map((br, i) => (i === index ? { ...br, ...patch } : br)) }
          : b,
      ),
    );
  }

  function removeBreak(key: string, index: number) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.key === key ? { ...b, breaks: b.breaks.filter((_, i) => i !== index) } : b,
      ),
    );
  }

  function copyToWeekdays(weekday: number) {
    const source = blocks.filter((b) => b.weekday === weekday);
    setBlocks((prev) =>
      [
        ...prev.filter((b) => b.weekday === weekday || b.weekday > 4 || b.weekday === weekday),
        ...[0, 1, 2, 3, 4]
          .filter((w) => w !== weekday)
          .flatMap((w) =>
            source.map((b) => ({
              ...b,
              key: nextKey(),
              weekday: w,
              breaks: b.breaks.map((br) => ({ ...br })),
            })),
          ),
      ].filter(
        (b, i, arr) =>
          b.weekday > 4 || b.weekday === weekday || arr.findIndex((x) => x.key === b.key) === i,
      ),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run({
      salonSlug,
      employeeId,
      blocks: blocks.map(({ weekday, startTime, endTime, breaks }) => ({
        weekday,
        startTime,
        endTime,
        breaks,
      })),
    });
  }

  const blockError = (index: number) =>
    Object.entries(fieldErrors).find(
      ([k]) => k.startsWith(`blocks.${index}.`) || k === `blocks.${index}`,
    )?.[1];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus error={formError ?? fieldErrors["blocks"] ?? null} success={success} />
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {WEEKDAY_KEYS.map((dayKey, weekday) => {
              const dayBlocks = blocks.filter((b) => b.weekday === weekday);
              const hours = salonHours.find((h) => h.weekday === weekday);
              return (
                <li key={dayKey} className="py-4" data-testid={`schedule-${dayKey}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="font-medium">{tDays(dayKey)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {hours?.isClosed
                          ? t("salonClosed")
                          : hours
                            ? t("salonOpen", { from: hours.opensAt, to: hours.closesAt })
                            : null}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {weekday === 0 && dayBlocks.length > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToWeekdays(0)}
                        >
                          {t("copyToWeekdays")}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => addBlock(weekday)}
                        aria-label={`${tDays(dayKey)}: ${t("addShift")}`}
                      >
                        <Plus aria-hidden /> {t("addShift")}
                      </Button>
                    </div>
                  </div>
                  {dayBlocks.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">{t("dayOff")}</p>
                  ) : null}
                  <div className="mt-2 space-y-3">
                    {dayBlocks.map((block) => {
                      const index = blocks.findIndex((b) => b.key === block.key);
                      return (
                        <div key={block.key} className="rounded-lg border bg-muted/30 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              type="time"
                              step={300}
                              value={block.startTime}
                              onChange={(e) =>
                                updateBlock(block.key, { startTime: e.target.value })
                              }
                              className="max-w-32"
                              aria-label={t("shiftStart")}
                            />
                            <span className="text-muted-foreground">–</span>
                            <Input
                              type="time"
                              step={300}
                              value={block.endTime}
                              onChange={(e) => updateBlock(block.key, { endTime: e.target.value })}
                              className="max-w-32"
                              aria-label={t("shiftEnd")}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => addBreak(block.key)}
                            >
                              <Plus aria-hidden /> {t("addBreak")}
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => removeBlock(block.key)}
                              aria-label={t("removeShift")}
                            >
                              <Trash2 aria-hidden />
                            </Button>
                          </div>
                          {block.breaks.length > 0 ? (
                            <ul className="mt-2 space-y-2 pl-4">
                              {block.breaks.map((br, i) => (
                                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="w-16 text-muted-foreground">{t("break")}</span>
                                  <Input
                                    type="time"
                                    step={300}
                                    value={br.startTime}
                                    onChange={(e) =>
                                      updateBreak(block.key, i, { startTime: e.target.value })
                                    }
                                    className="max-w-28"
                                    aria-label={t("breakStart")}
                                  />
                                  <span className="text-muted-foreground">–</span>
                                  <Input
                                    type="time"
                                    step={300}
                                    value={br.endTime}
                                    onChange={(e) =>
                                      updateBreak(block.key, i, { endTime: e.target.value })
                                    }
                                    className="max-w-28"
                                    aria-label={t("breakEnd")}
                                  />
                                  <Input
                                    value={br.label ?? ""}
                                    onChange={(e) =>
                                      updateBreak(block.key, i, { label: e.target.value || null })
                                    }
                                    placeholder={t("breakLabel")}
                                    className="max-w-40"
                                  />
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeBreak(block.key, i)}
                                    aria-label={t("removeBreak")}
                                  >
                                    <Trash2 aria-hidden />
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {blockError(index) ? (
                            <p className="mt-2 text-xs text-destructive">{blockError(index)}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
