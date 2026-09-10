"use client";

import { useLinkStatus } from "next/link";

/**
 * A hint that a clicked link is still fetching its page.
 *
 * Every route here is server-rendered on demand — the build marks all of them
 * dynamic — and none has a `loading.tsx`. So a click can sit for a moment with
 * the old page still on screen and nothing saying the click landed.
 *
 * `loading.tsx` is the framework's preferred answer and the wrong one here: it
 * replaces the whole page with a fallback, which for a tab inside one
 * application would throw away the header the reader is using to keep their
 * place. A hint on the link they clicked is the smaller, truer signal.
 *
 * Two constraints shape it:
 *
 * It is always rendered at a fixed size and only its opacity moves. This
 * layout has a zero-shift budget in CI, and an element that appears on click
 * would shift the row it is in.
 *
 * The transition carries a delay, not just a duration. A prefetched or fast
 * navigation finishes inside the delay and the hint never becomes visible, so
 * it marks a wait rather than decorating every click. The delay also survives
 * `prefers-reduced-motion`, which collapses durations but not delays — so a
 * reader who asked for less motion still gets the hint on a slow navigation,
 * without the fade.
 *
 * It is `aria-hidden`. The page that arrives is the announcement; a second,
 * wordless one would only interrupt.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={`link-pending${pending ? " is-pending" : ""}`}
    />
  );
}
