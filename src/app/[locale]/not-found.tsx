import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFoundPage() {
  const t = await getTranslations("errors.notFound");
  const common = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-4 max-w-md text-muted-foreground">{t("description")}</p>
      <Button className="mt-8" render={<Link href="/" />}>
        {common("backHome")}
      </Button>
    </main>
  );
}
