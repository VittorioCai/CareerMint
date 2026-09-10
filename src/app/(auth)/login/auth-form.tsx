"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AuthFeedback } from "@/components/auth-feedback";
import type { Dictionary } from "@/i18n/dictionaries/en";

import { login, signup, type AuthActionState } from "./actions";

const initialState: AuthActionState = { error: null, message: null };

export type CallbackError =
  | "invalid-link"
  | "session-not-created"
  | "email-link-used";

function callbackMessage(
  auth: Dictionary["auth"],
  error: CallbackError,
): string {
  const messages: Record<CallbackError, string> = {
    "invalid-link": auth.callback.invalidLink,
    "session-not-created": auth.callback.sessionNotCreated,
    "email-link-used": auth.callback.emailLinkUsed,
  };
  return messages[error];
}

export function AuthForm({
  callbackError,
  auth,
}: {
  callbackError?: CallbackError;
  auth: Dictionary["auth"];
}) {
  const [loginState, loginAction, loginPending] = useActionState(
    login,
    initialState,
  );
  const [signupState, signupAction, signupPending] = useActionState(
    signup,
    initialState,
  );
  const pending = loginPending || signupPending;
  const state = signupState.message || signupState.error ? signupState : loginState;
  const consumedEmailLink = callbackError === "email-link-used";

  return (
    <form className="space-y-5">
      <AuthFeedback
        error={
          callbackError && !consumedEmailLink
            ? callbackMessage(auth, callbackError)
            : state.error
        }
        message={
          consumedEmailLink
            ? callbackMessage(auth, callbackError)
            : callbackError
              ? null
              : state.message
        }
      />

      {callbackError === "email-link-used" ? (
        <Link href="/login" className="button-secondary block min-h-12 px-5 text-center font-semibold">
          {auth.backToSignIn}
        </Link>
      ) : null}

      <div>
        <label className="form-label" htmlFor="email">{auth.email}</label>
        <input
          className="form-input"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          required
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className="form-label mb-0" htmlFor="password">{auth.password}</label>
          <Link href="/forgot-password" className="text-sm font-bold underline decoration-[var(--ink-soft)] underline-offset-4 hover:text-[var(--ink-muted)]">{auth.forgotPassword}</Link>
        </div>
        <input
          className="form-input"
          id="password"
          name="password"
          type="password"
          minLength={8}
          maxLength={128}
          autoComplete="current-password"
          placeholder={auth.passwordPlaceholder}
          required
        />
      </div>

      <div className="grid gap-3 pt-1 sm:grid-cols-2">
        <button className="button-primary min-h-12 px-5 font-semibold disabled:cursor-wait disabled:opacity-60" type="submit" formAction={loginAction} disabled={pending}>
          {loginPending ? auth.signingIn : auth.signIn}
        </button>
        <button className="button-secondary min-h-12 px-5 font-semibold disabled:cursor-wait disabled:opacity-60" type="submit" formAction={signupAction} disabled={pending}>
          {signupPending ? auth.signingUp : auth.signUp}
        </button>
      </div>

      <p className="text-xs font-medium leading-5 text-[var(--ink-muted)]">{auth.signUpNote}</p>
    </form>
  );
}
