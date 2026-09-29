"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Receipt = { message: string; at: number };

const AnnounceContext = createContext<(message: string) => void>(() => {});
const ReceiptContext = createContext<{
  receipt: Receipt | null;
  dismiss: () => void;
}>({ receipt: null, dismiss: () => {} });

/**
 * Holds the receipt for something that has just left the list.
 *
 * A deleted fact cannot say so itself: the action revalidates the page, and
 * the card that made the request is gone in the same render that would have
 * shown the message. So the message is kept above the list, in something that
 * is still there afterwards.
 */
export function FactReceiptProvider({ children }: { children: ReactNode }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  return (
    <AnnounceContext
      value={(message) => setReceipt({ message, at: Date.now() })}
    >
      <ReceiptContext value={{ receipt, dismiss: () => setReceipt(null) }}>
        {children}
      </ReceiptContext>
    </AnnounceContext>
  );
}

/** Outside a provider this is a no-op, so a card can be rendered on its own. */
export function useAnnounceFactReceipt() {
  return useContext(AnnounceContext);
}

export function FactReceiptRegion({ dismissLabel }: { dismissLabel: string }) {
  const { receipt, dismiss } = useContext(ReceiptContext);
  const ref = useRef<HTMLDivElement>(null);

  // The button that was pressed went with the card, and the dialog around it
  // was taken out of the document while open, so focus has nowhere to return
  // to and lands on <body>. Put it on the receipt instead.
  useEffect(() => {
    if (receipt) ref.current?.focus();
  }, [receipt]);

  // Always in the document, empty or not: a live region that is inserted
  // together with its text is not reliably announced.
  return (
    <div
      ref={ref}
      role="status"
      tabIndex={-1}
      className={
        receipt
          ? "sticky top-20 z-10 mb-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 shadow-[var(--elevation-1)]"
          : undefined
      }
    >
      {receipt ? (
        <>
          <p className="min-w-0 break-words text-sm font-semibold">
            {receipt.message}
          </p>
          <button
            type="button"
            className="text-action min-h-10 shrink-0 px-2 text-xs font-semibold"
            onClick={dismiss}
          >
            {dismissLabel}
          </button>
        </>
      ) : null}
    </div>
  );
}
