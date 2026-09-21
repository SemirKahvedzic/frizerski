import { notFound } from "next/navigation";
import { cache } from "react";

import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { isAppError } from "@/lib/errors";
import { getCurrentPrincipal } from "@/modules/auth";
import { resolveTenantContext, type TenantContext } from "@/modules/tenant";

/**
 * Resolves the admin tenant context once per request (React `cache` dedupes
 * the layout and page calls). Anonymous → login, non-member / suspended → 404.
 */
export const getAdminContext = cache(
  async (locale: AppLocale, salonSlug: string): Promise<TenantContext> => {
    const principal = await getCurrentPrincipal();
    if (principal.kind === "anonymous") {
      redirect({
        href: { pathname: "/login", query: { next: `/${locale}/admin/${salonSlug}` } },
        locale,
      });
    }
    try {
      return await resolveTenantContext(principal, { slug: salonSlug });
    } catch (error) {
      if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) {
        notFound();
      }
      throw error;
    }
  },
);
