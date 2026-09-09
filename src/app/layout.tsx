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

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  display: "swap",
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
