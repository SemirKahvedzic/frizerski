import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { MobileNav } from "@/components/admin/mobile-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";

export type AdminShellProps = {
  salon: { slug: string; name: string; status: "ACTIVE" | "INACTIVE" | "SUSPENDED" };
  role: "OWNER" | "ADMIN" | "EMPLOYEE" | "PLATFORM";
  children: ReactNode;
};

/** Responsive admin layout: fixed sidebar on desktop, sheet on smaller screens. */
export async function AdminShell({ salon, role, children }: AdminShellProps) {
  const [t, common] = await Promise.all([getTranslations("admin"), getTranslations("common")]);

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center gap-2 px-5">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            {common("appName")}
          </Link>
        </div>
        <div className="px-3 pb-3">
          <div className="rounded-lg border px-3 py-2">
            <div className="truncate text-sm font-medium">{salon.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t(`role.${role}`)}</span>
              {salon.status !== "ACTIVE" ? (
                <Badge variant="destructive" className="text-[10px]">
                  {t(`status.${salon.status}`)}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <AdminNav salonSlug={salon.slug} />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <Link
            href={`/salon/${salon.slug}`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            target="_blank"
          >
            <ExternalLink className="size-4" aria-hidden />
            {t("viewPublicPage")}
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <MobileNav salonSlug={salon.slug} salonName={salon.name} />
          <div className="min-w-0 flex-1 truncate font-medium lg:hidden">{salon.name}</div>
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher />
            <Link
              href="/account"
              className="hidden text-sm text-muted-foreground hover:underline sm:inline"
            >
              {t("backToAccount")}
            </Link>
            <SignOutButton variant="ghost" />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
