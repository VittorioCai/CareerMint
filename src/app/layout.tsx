import { Inter } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { HTML_LANG } from "@/i18n/locale";
import { getDictionary, getLocale } from "@/i18n/server";

import "./globals.css";

/**
 * The fallback for readers without San Francisco. Every Apple device resolves
 * `-apple-system` first (see `--font-system` in globals.css) and never paints
 * this face; everywhere else Inter is the nearest open match to SF.
 *
 * Self-hosted through next/font rather than fontsource, for one reason: it
 * generates a metric-matched fallback face, so the text does not move when the
 * real font arrives. `font-display: swap` on its own reflows the whole page.
 *
 * Nunito Sans is gone with the sticker direction: headings now ask the system
 * for SF Pro Display, which costs no request and so cannot shift layout.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
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
      className={inter.variable}
    >
      <body>{children}</body>
    </html>
  );
}
