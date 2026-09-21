import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CreateSalonForm } from "@/components/salons/create-salon-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { redirect } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { getCurrentActor } from "@/modules/auth";

import { createSalonAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/salons/new">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "salons.create" });
  return { title: t("title") };
}

export default async function NewSalonPage({ params }: PageProps<"/[locale]/account/salons/new">) {
  const locale = await resolveLocaleParam(params);
  const actor = await getCurrentActor();
  if (!actor) {
    return redirect({
      href: { pathname: "/login", query: { next: `/${locale}/account/salons/new` } },
      locale,
    });
  }
  const t = await getTranslations("salons");

  return (
    <section className="mx-auto w-full max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">{t("create.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("create.subtitle")}</p>
      {!actor.emailVerified ? (
        <Alert className="mt-6">
          <AlertDescription>{t("errors.verifyFirst")}</AlertDescription>
        </Alert>
      ) : null}
      <div className="mt-8">
        <CreateSalonForm action={createSalonAction} />
      </div>
    </section>
  );
}
