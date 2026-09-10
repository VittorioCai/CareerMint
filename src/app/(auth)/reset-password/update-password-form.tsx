"use client";

import { useActionState } from "react";

import { AuthFeedback } from "@/components/auth-feedback";
import type { Dictionary } from "@/i18n/dictionaries/en";
import {
  updatePassword,
  type AuthActionState,
} from "@/app/(auth)/login/actions";

const initialState: AuthActionState = { error: null, message: null };

export function UpdatePasswordForm({ copy }: { copy: Dictionary["auth"] }) {
  const [state, action, pending] = useActionState(updatePassword, initialState);

  return (
    <form action={action} className="space-y-5">
      <AuthFeedback error={state.error} message={state.message} />
      <div>
        <label className="form-label" htmlFor="password">{copy.newPassword}</label>
        <input className="form-input" id="password" name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required />
      </div>
      <div>
        <label className="form-label" htmlFor="confirmPassword">{copy.confirmNewPassword}</label>
        <input className="form-input" id="confirmPassword" name="confirmPassword" type="password" minLength={8} maxLength={128} autoComplete="new-password" required />
      </div>
      <button className="button-primary min-h-12 w-full px-5 font-semibold disabled:cursor-wait disabled:opacity-60" type="submit" disabled={pending}>
        {pending ? copy.updating : copy.updateAndEnter}
      </button>
    </form>
  );
}
