"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/modules/auth/client";

export function ResendVerificationButton({
  email,
  label,
  variant = "outline",
}: {
  email: string;
  label?: string;
  variant?: "outline" | "default" | "secondary" | "ghost" | "link";
}) {
  const t = useTranslations("auth.verify");
  const tErrors = useTranslations("auth.errors");
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "pending" | "sent" | "error">("idle");

  async function resend() {
    setState("pending");
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: `/${locale}/account`,
    });
    setState(error ? "error" : "sent");
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant={variant} onClick={resend} disabled={state === "pending"}>
        {label ?? t("resend")}
      </Button>
      {state === "sent" ? <p className="text-sm text-muted-foreground">{t("resent")}</p> : null}
      {state === "error" ? <p className="text-sm text-destructive">{tErrors("generic")}</p> : null}
    </div>
  );
}
