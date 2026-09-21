"use client";

import { BellOff, BellRing, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type State =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "disabled" } // server has no push provider
  | { kind: "denied" }
  | { kind: "off"; publicKey: string }
  | { kind: "on"; publicKey: string; endpoint: string };

function base64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** "Enable push on this device" card for the account notifications page. */
export function PushToggle() {
  const t = useTranslations("account.notifications.push");
  const locale = useLocale();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detect = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState({ kind: "unsupported" });
      return;
    }
    const config = (await (await fetch("/api/v1/push/vapid-public-key")).json()) as {
      data: { enabled: boolean; publicKey: string | null };
    };
    if (!config.data.enabled || !config.data.publicKey) {
      setState({ kind: "disabled" });
      return;
    }
    if (Notification.permission === "denied") {
      setState({ kind: "denied" });
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration("/");
    const existing = await registration?.pushManager.getSubscription();
    if (existing)
      setState({ kind: "on", publicKey: config.data.publicKey, endpoint: existing.endpoint });
    else setState({ kind: "off", publicKey: config.data.publicKey });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void detect().catch(() => setState({ kind: "unsupported" })), 0);
    return () => clearTimeout(id);
  }, [detect]);

  async function enable(publicKey: string) {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({ kind: "denied" });
        return;
      }
      const registration =
        (await navigator.serviceWorker.getRegistration("/")) ??
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(publicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      const response = await fetch("/api/v1/me/push-subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, locale }),
      });
      if (!response.ok) throw new Error(t("error"));
      setState({ kind: "on", publicKey, endpoint: subscription.endpoint });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function disable(publicKey: string, endpoint: string) {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      await fetch("/api/v1/me/push-subscriptions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      setState({ kind: "off", publicKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="push-toggle">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {state.kind === "loading" ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t("checking")}
          </p>
        ) : null}
        {state.kind === "unsupported" ? (
          <p className="text-muted-foreground">{t("unsupported")}</p>
        ) : null}
        {state.kind === "disabled" ? (
          <p className="text-muted-foreground" data-testid="push-disabled">
            {t("serverDisabled")}
          </p>
        ) : null}
        {state.kind === "denied" ? (
          <p className="text-muted-foreground" data-testid="push-denied">
            {t("denied")}
          </p>
        ) : null}
        {state.kind === "off" ? (
          <Button onClick={() => enable(state.publicKey)} disabled={busy} data-testid="push-enable">
            <BellRing aria-hidden /> {t("enable")}
          </Button>
        ) : null}
        {state.kind === "on" ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 text-emerald-700">
              <BellRing className="size-4" aria-hidden /> {t("enabledHere")}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disable(state.publicKey, state.endpoint)}
              disabled={busy}
              data-testid="push-disable"
            >
              <BellOff aria-hidden /> {t("disable")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
