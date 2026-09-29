"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { StandaloneFrameCopy } from "@/components/standalone-frame";

import type { Dictionary } from "./dictionaries/en";

export type ErrorCopy = Dictionary["errorPages"] & {
  retry: string;
  /** What the page around a root-level error needs: see StandaloneFrame. */
  frame: StandaloneFrameCopy;
};

const ErrorCopyContext = createContext<ErrorCopy | null>(null);

/**
 * The sentences an error boundary needs, put where it can reach them.
 *
 * `error.tsx` has to be a client component, and the language is decided on the
 * server from a cookie and a profile row. Importing the dictionaries into the
 * boundary instead would ship both languages, whole, to every page. So the
 * root layout resolves the one namespace and hands it down; the boundary
 * renders below the layout and reads it from here.
 */
export function ErrorCopyProvider({
  copy,
  children,
}: {
  copy: ErrorCopy;
  children: ReactNode;
}) {
  return <ErrorCopyContext value={copy}>{children}</ErrorCopyContext>;
}

export function useErrorCopy(): ErrorCopy | null {
  return useContext(ErrorCopyContext);
}
