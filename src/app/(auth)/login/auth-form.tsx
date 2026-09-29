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

export type AuthMode = "signIn" | "signUp";

/**
 * One form, one job.
 *
 * It used to be both: two submit buttons side by side under a heading that
 * welcomed everyone back, including the people arriving for the first time.
 * The password rule lived in the placeholder, which is there until the moment
 * it would be useful. The mode is in the URL rather than in state so the page
 * around the form — its heading, its first sentence — can say the same thing
 * the form does.
 */
export function AuthForm({
  callbackError,
  auth,
  mode = "signIn",
}: {
  callbackError?: CallbackError;
  auth: Dictionary["auth"];
  mode?: AuthMode;
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
  const signingUp = mode === "signUp";

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
          {/* Nobody has forgotten a password they are in the middle of choosing. */}
          {signingUp ? null : (
            <Link href="/forgot-password" className="text-action text-sm font-bold underline decoration-[var(--ink-soft)] underline-offset-4 hover:text-[var(--ink-muted)]">{auth.forgotPassword}</Link>
          )}
        </div>
        <input
          className="form-input"
          id="password"
          name="password"
          type="password"
          minLength={8}
          maxLength={128}
          autoComplete={signingUp ? "new-password" : "current-password"}
          aria-describedby={signingUp ? "password-rule" : undefined}
          required
        />
        {signingUp ? (
          <p id="password-rule" className="mt-2 text-xs font-medium text-[var(--ink-muted)]">
            {auth.passwordRule}
          </p>
        ) : null}
      </div>

      <div className="pt-1">
        {signingUp ? (
          <button className="button-primary min-h-12 w-full px-5 font-semibold disabled:cursor-wait disabled:opacity-60" type="submit" formAction={signupAction} disabled={pending}>
            {signupPending ? auth.signingUp : auth.signUp}
          </button>
        ) : (
          <button className="button-primary min-h-12 w-full px-5 font-semibold disabled:cursor-wait disabled:opacity-60" type="submit" formAction={loginAction} disabled={pending}>
            {loginPending ? auth.signingIn : auth.signIn}
          </button>
        )}
      </div>

      {signingUp ? (
        <p className="text-xs font-medium leading-5 text-[var(--ink-muted)]">{auth.signUpNote}</p>
      ) : null}

      <p className="text-sm font-medium text-[var(--ink-muted)]">
        {signingUp ? auth.haveAccount : auth.noAccount}{" "}
        <Link
          href={signingUp ? "/login" : "/login?mode=signup"}
          // Inline on purpose: it is a link inside a sentence, and the sentence
          // is what gives a thumb its target. As a box of its own, 登录 is two
          // characters wide.
          className="font-bold text-[var(--ink)] underline decoration-[var(--ink-soft)] underline-offset-4 hover:text-[var(--ink-muted)]"
        >
          {signingUp ? auth.signIn : auth.signUp}
        </Link>
      </p>
    </form>
  );
}
