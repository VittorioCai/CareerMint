import { Inter, Nunito_Sans } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";

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

export const metadata: Metadata = {
  title: {
    default: "求职搭子｜有依据的海外求职工作台",
    template: "%s｜求职搭子",
  },
  description: "用已确认的职业事实匹配岗位、定制简历、跟踪投递并准备面试。",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${nunitoSans.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
