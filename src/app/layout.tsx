import { Inter, Nunito_Sans } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { HTML_LANG } from "@/i18n/locale";
import { getDictionary, getLocale } from "@/i18n/server";

import "./globals.css";

/**
 * Self-hosted through next/font rather than fontsource, for one reason: it
 * generates a metric-matched fallback face, so the text does not move when the
 * real font arrives. `font-display: swap` on its own reflows the whole page.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/**
 * Not preloaded. Every route's first paint in this app is Chinese, which no
 * Latin face covers — Nunito Sans is only reached by the Latin runs inside
 * headings ("Product Analyst", "Job desk"). Preloading it puts 30 KB on the
 * critical path of a login screen whose only Latin string is a placeholder
 * email. It still loads when something needs it, and the metric-matched
 * fallback means arriving late costs no layout shift.
 */
const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-nunito-sans",
});

/**
 * Metadata is resolved per request like everything else, so a tab title and a
 * search snippet are in the reader's language rather than the author's.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await getDictionary();
  return {
    title: { default: meta.title, template: meta.titleTemplate },
    description: meta.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // `lang` is not decoration: it decides which voice a screen reader uses and
  // which dictionary the browser hyphenates and spell-checks with. A page of
  // English served as zh-CN is read aloud by a Chinese synthesiser.
  const locale = await getLocale();

  return (
    <html
      lang={HTML_LANG[locale]}
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${nunitoSans.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
