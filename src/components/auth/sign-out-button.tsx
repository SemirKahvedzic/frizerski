"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/modules/auth/client";

export function SignOutButton({
  variant = "outline",
}: {
  variant?: "outline" | "ghost" | "default";
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Button type="button" variant={variant} onClick={signOut} disabled={pending}>
      {t("signOut")}
    </Button>
  );
}
