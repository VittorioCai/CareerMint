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
 * Preloaded, which it was not while this product had one language.
 *
 * The old reasoning was sound and is now wrong in every part: the first paint
 * was Chinese, which no Latin face covers, so Nunito Sans was reached only by
 * the Latin runs inside a Chinese heading — 30 KB on the critical path to set
 * "Product Analyst". English is the default now, so this face carries the
 * whole of every page's largest text.
 *
 * And "arriving late costs no layout shift" held only for the vertical
 * metrics the fallback matches. It says nothing about advance widths, so a
 * heading sitting near a wrap boundary changes line count when the real font
 * lands: the English sign-in title measured 100px in the fallback and 150px
 * in Nunito Sans, moving the form 50px down for a CLS of 0.021 against a
 * budget of 0.001. Reserving space for the taller case would have been
 * guessing at a number that changes with every string and every width.
 */
const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  display: "swap",
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
