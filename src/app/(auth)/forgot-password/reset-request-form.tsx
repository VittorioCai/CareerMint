"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AuthFeedback } from "@/components/auth-feedback";
import type { Dictionary } from "@/i18n/dictionaries/en";
import {
  requestPasswordReset,
  type AuthActionState,
} from "@/app/(auth)/login/actions";

const initialState: AuthActionState = { error: null, message: null };

export function ResetRequestForm({ copy }: { copy: Dictionary["auth"] }) {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <form action={action} className="space-y-5">
      <AuthFeedback error={state.error} message={state.message} />
      <div>
        <label className="form-label" htmlFor="email">{copy.resetEmail}</label>
        <input className="form-input" id="email" name="email" type="email" autoComplete="email" placeholder="name@example.com" required />
      </div>
      <button className="button-primary min-h-12 w-full px-5 font-semibold disabled:cursor-wait disabled:opacity-60" type="submit" disabled={pending}>
        {pending ? copy.sending : copy.sendResetLink}
      </button>
      <Link href="/login" className="block text-center text-sm font-bold underline decoration-[var(--ink-soft)] underline-offset-4">{copy.backToSignIn}</Link>
    </form>
  );
}
