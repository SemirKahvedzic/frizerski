"use client";

import { useEffect } from "react";

/**
 * Marks the document once React has hydrated. Automated tests wait for this
 * before interacting with forms, so a click can never land on a not-yet
 * interactive page and fall back to a native submit.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset["hydrated"] = "true";
  }, []);
  return null;
}
