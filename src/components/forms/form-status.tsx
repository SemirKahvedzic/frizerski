"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";

export function FormStatus({ error, success }: { error: string | null; success: boolean }) {
  const t = useTranslations("common");
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (success) {
    return (
      <Alert>
        <CheckCircle2 aria-hidden />
        <AlertDescription>{t("saved")}</AlertDescription>
      </Alert>
    );
  }
  return null;
}
