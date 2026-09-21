import { notFound } from "next/navigation";

/**
 * Catch-all for unmatched routes inside a locale so that the localized
 * `[locale]/not-found.tsx` renders instead of Next.js' default 404.
 */
export default function CatchAllPage() {
  notFound();
}
