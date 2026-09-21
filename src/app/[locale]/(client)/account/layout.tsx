import { getTranslations } from "next-intl/server";

import { AccountNav } from "@/components/account/account-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";

export default async function AccountLayout({
  params,
  children,
}: LayoutProps<"/[locale]/account">) {
  await resolveLocaleParam(params);
  const common = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {common("appName")}
        </Link>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 sm:px-6">
        <AccountNav />
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
