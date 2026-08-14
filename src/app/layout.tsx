import "@fontsource-variable/inter";
import "@fontsource-variable/nunito-sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "求职搭子｜有依据的海外求职工作台",
    template: "%s｜求职搭子",
  },
  description: "用已确认的职业事实匹配岗位、定制简历、跟踪投递并准备面试。",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
