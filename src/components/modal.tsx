"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A modal dialog, delegated to the platform.
 *
 * The two dialogs this replaces were `<div role="dialog" aria-modal="true">`,
 * which is a promise the markup could not keep: Tab walked straight out into
 * the page behind, Escape did nothing, and closing left the focus wherever it
 * happened to be. `aria-modal` told a screen reader the rest of the page was
 * unreachable while it stayed entirely reachable.
 *
 * `showModal()` is the whole feature. The browser traps focus, marks the rest
 * of the document inert, handles Escape, paints a `::backdrop`, puts the
 * element in the top layer so no z-index can bury it, and returns focus to
 * whatever opened it. None of that is worth reimplementing, and a hand-rolled
 * trap is the kind of code that quietly rots.
 *
 * `open` stays the caller's: Escape reports through `onClose` instead of the
 * element closing itself, or React's next render would reopen it.
 */
export function Modal({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // The element stays mounted so that closing goes through `close()`. Pulling
  // an open dialog out of the DOM instead drops it from the top layer without
  // ever restoring focus to whatever opened it. The children are unmounted so
  // nothing they own — an uncontrolled input, a scroll position — is still
  // there next time; state the caller holds is the caller's to reset.
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className="modal-dialog motion-enter soft-surface w-[min(100%-2rem,32rem)] p-5 text-[var(--ink)] sm:p-7"
      onCancel={(event) => {
        // Escape. Let the caller take `open` down rather than the element
        // closing under React's feet.
        event.preventDefault();
        onClose();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
