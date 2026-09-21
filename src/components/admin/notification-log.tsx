"use client";

import { RefreshCw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link, useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";
import { cn } from "@/lib/utils";

export type NotificationLogRow = {
  id: string;
  bookingId: string | null;
  channel: "EMAIL" | "PUSH" | "IN_APP";
  type: string;
  status: "QUEUED" | "SENT" | "FAILED" | "SKIPPED";
  recipient: string;
  locale: string;
  subject: string | null;
  attempts: number;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
};

const STATUS_VARIANT = {
  QUEUED: "secondary",
  SENT: "default",
  FAILED: "destructive",
  SKIPPED: "outline",
} as const;

const FILTERS = [null, "SENT", "FAILED", "SKIPPED", "QUEUED"] as const;

export function NotificationLog({
  salonSlug,
  timezone,
  status,
  items,
  resend,
}: {
  salonSlug: string;
  timezone: string;
  status: string | null;
  items: NotificationLogRow[];
  resend: (input: unknown) => Promise<ActionResult<NotificationLogRow>>;
}) {
  const t = useTranslations("notificationsAdmin");
  const tType = useTranslations("notificationType");
  const format = useFormatter();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onResend(id: string) {
    setBusy(id);
    setMessage(null);
    const result = await resend({ salonSlug, notificationId: id });
    setBusy(null);
    setMessage(
      result.ok
        ? t(result.data.status === "SENT" ? "resent" : "resendFailed")
        : result.error.message,
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border p-0.5" role="tablist">
        {FILTERS.map((f) => (
          <Link
            key={f ?? "all"}
            href={{ pathname: `/admin/${salonSlug}/notifications`, query: f ? { status: f } : {} }}
            role="tab"
            aria-selected={status === f}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              status === f ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {f ? t(`status.${f}`) : t("all")}
          </Link>
        ))}
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="divide-y" data-testid="notification-log">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm"
                  data-testid={`notification-${item.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{tType(item.type as never)}</span>
                      <Badge variant={STATUS_VARIANT[item.status]}>
                        {t(`status.${item.status}`)}
                      </Badge>
                    </div>
                    <div className="truncate text-muted-foreground">
                      {item.recipient}
                      {item.subject ? ` · ${item.subject}` : ""}
                    </div>
                    {item.error ? (
                      <div className="mt-1 text-xs text-destructive">
                        {item.status === "SKIPPED" &&
                        t.has(`skip.${item.error.replaceAll(".", "_")}` as never)
                          ? t(`skip.${item.error.replaceAll(".", "_")}` as never)
                          : item.error}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-muted-foreground tabular-nums">
                    <div>
                      {format.dateTime(new Date(item.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: timezone,
                      })}
                    </div>
                    {item.attempts > 0 ? (
                      <div>{t("attempts", { count: item.attempts })}</div>
                    ) : null}
                  </div>
                  {item.channel === "EMAIL" &&
                  item.status !== "QUEUED" &&
                  item.status !== "SKIPPED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === item.id}
                      onClick={() => onResend(item.id)}
                      data-testid={`resend-${item.id}`}
                    >
                      <RefreshCw
                        aria-hidden
                        className={busy === item.id ? "animate-spin" : undefined}
                      />
                      {t("resend")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
