"use client";

import { useEffect } from "react";

/** Registers `/sw.js` once the page is idle; harmless where unsupported. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !/[?&]sw=1/.test(window.location.search)) {
      // In development the worker would cache stale chunks; opt in with `?sw=1`.
      return;
    }
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
