"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";

type Status = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export function SalonStatusButtons({
  salonId,
  status,
  action,
}: {
  salonId: string;
  status: Status;
  action: (input: {
    salonId: string;
    status: Status;
  }) => Promise<ActionResult<{ id: string; status: Status }>>;
}) {
  const t = useTranslations("platform.salons");
  const router = useRouter();
  const [pending, setPending] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(next: Status) {
    setPending(next);
    setError(null);
    const result = await action({ salonId, status: next });
    setPending(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  const options: Status[] = (["ACTIVE", "INACTIVE", "SUSPENDED"] as Status[]).filter(
    (s) => s !== status,
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((next) => (
        <Button
          key={next}
          size="sm"
          variant={next === "SUSPENDED" ? "destructive" : "outline"}
          disabled={pending !== null}
          onClick={() => change(next)}
        >
          {t(`actions.${next}`)}
        </Button>
      ))}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
