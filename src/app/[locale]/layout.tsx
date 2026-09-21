import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";

import { HydrationMarker } from "@/components/hydration-marker";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/i18n/params";
import { routing } from "@/i18n/routing";

import "../globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "common" });
  return {
    title: { default: t("appName"), template: `%s · ${t("appName")}` },
    description: t("tagline"),
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: t("appName") },
    icons: {
      icon: [
        { url: "/icons/icon.svg", type: "image/svg+xml" },
        { url: "/icons/icon-192.png", sizes: "192x192" },
      ],
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = { themeColor: "#111827", width: "device-width", initialScale: 1 };

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = await resolveLocaleParam(params);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <HydrationMarker />
          <RegisterServiceWorker />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
