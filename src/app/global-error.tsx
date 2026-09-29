"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * The last boundary: the root layout itself failed, so nothing it provides is
 * here — no stylesheet, no fonts, no dictionary, no resolved language. This
 * page carries its own of each, which is why the two languages are written out
 * below instead of coming from `@/i18n/dictionaries`, and why the styles are
 * written here. The colours are `--canvas` and `--ink` from globals.css, in
 * both gradings; the button is the primary one, ink on canvas reversed. There
 * is no theme attribute to read, so dark follows the operating system.
 *
 * The language is read from the same cookie the server reads. A profile
 * preference that differs from the cookie is not reachable from here.
 */
const STYLES = `
  body { margin: 0; min-height: 100vh; background: #f4f3f0; color: #1f2320;
    font-family: system-ui, -apple-system, "PingFang SC", sans-serif; }
  main { max-width: 560px; margin: 0 auto; padding: 64px 20px; }
  h1 { font-size: 28px; line-height: 1.25; margin: 0; }
  p { font-size: 16px; line-height: 1.75; margin: 16px 0 0; }
  p.reference { font-size: 12px; margin-top: 12px; word-break: break-all; }
  button { margin-top: 32px; min-height: 44px; padding: 0 20px; border: 0;
    border-radius: 12px; background: #1f2320; color: #f4f3f0; font: inherit;
    font-size: 14px; font-weight: 600; cursor: pointer; }
  button:focus-visible { outline: 2px solid #1f2320; outline-offset: 3px; }
  @media (prefers-color-scheme: dark) {
    body { background: #161a18; color: #e8ece9; }
    button { background: #e8ece9; color: #161a18; }
    button:focus-visible { outline-color: #e8ece9; }
  }
`;

const COPY = {
  en: {
    title: "CareerMint could not load",
    body: "Nothing you saved has been lost. Try again in a moment.",
    retry: "Try again",
    reference: "Reference: ",
  },
  "zh-CN": {
    title: "求职搭子暂时无法加载",
    body: "你已保存的内容没有丢失，请稍后重试。",
    retry: "重试",
    reference: "参考编号：",
  },
} as const;

type Locale = keyof typeof COPY;

function cookieLocale(): Locale {
  return /(?:^|;\s*)interface-locale=zh-CN(?:;|$)/u.test(document.cookie)
    ? "zh-CN"
    : "en";
}

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // The cookie does not change under this page, so there is nothing to
  // subscribe to; the store is only here so the server render, which has no
  // `document`, and hydration agree before the real value is read.
  const locale = useSyncExternalStore<Locale>(
    () => () => {},
    cookieLocale,
    () => "en",
  );

  useEffect(() => {
    console.error(error);
  }, [error]);

  const copy = COPY[locale];

  return (
    <html lang={locale}>
      <body>
        <title>{copy.title}</title>
        <style>{STYLES}</style>
        <main role="alert">
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
          {error.digest ? (
            <p className="reference">
              {copy.reference}
              {error.digest}
            </p>
          ) : null}
          <button type="button" onClick={() => retry()}>
            {copy.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
