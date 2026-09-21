import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

/** Web app manifest: makes the site installable (PWA) on Android, iOS and desktop. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: env.APP_NAME,
    short_name: env.APP_NAME,
    description: "Online booking for hair salons",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f4",
    theme_color: "#111827",
    lang: "bs",
    categories: ["lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
