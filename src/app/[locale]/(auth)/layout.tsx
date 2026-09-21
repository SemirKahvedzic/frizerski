import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/i18n/navigation";

export default async function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const t = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {t("appName")}
        </Link>
        <LocaleSwitcher />
      </header>
      <section className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
