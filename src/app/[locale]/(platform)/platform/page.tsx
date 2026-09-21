import { redirect } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";

export default async function PlatformIndexPage({ params }: PageProps<"/[locale]/platform">) {
  const locale = await resolveLocaleParam(params);
  return redirect({ href: "/platform/salons", locale });
}
