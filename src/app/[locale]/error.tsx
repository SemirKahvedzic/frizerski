"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Route error boundary. Shows a translated, non-technical message; the
 * technical details are logged server-side with the request id.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.generic");
  const common = useTranslations("common");

  useEffect(() => {
    // Client-side visibility only; server logs carry the stack.
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-4 max-w-md text-muted-foreground">{t("description")}</p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">{error.digest}</p>
      ) : null}
      <Button className="mt-8" onClick={reset}>
        {common("retry")}
      </Button>
    </main>
  );
}
