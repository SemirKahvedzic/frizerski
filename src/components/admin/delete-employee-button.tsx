"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";

export function DeleteEmployeeButton({
  salonSlug,
  employeeId,
  action,
}: {
  salonSlug: string;
  employeeId: string;
  action: (input: {
    salonSlug: string;
    employeeId: string;
  }) => Promise<ActionResult<{ id: string }>>;
}) {
  const t = useTranslations("employees");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    const result = await action({ salonSlug, employeeId });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.push(`/admin/${salonSlug}/employees`);
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        <Trash2 aria-hidden /> {t("delete.button")}
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{t("delete.confirm")}</span>
      <Button variant="destructive" size="sm" onClick={remove} disabled={pending}>
        {t("delete.yes")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
        {t("delete.no")}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
