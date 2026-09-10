"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isAppLocale, LOCALE_COOKIE } from "@/i18n/locale";
import { getDictionary } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";

import {
  emailFormSchema,
  loginFormSchema,
  updatePasswordFormSchema,
} from "./schema";

export type AuthActionState = {
  error: string | null;
  message: string | null;
};

function loginFormValues(formData: FormData) {
  return {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
}

export async function login(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { auth } = await getDictionary();
  const parsed = loginFormSchema.safeParse(loginFormValues(formData));
  if (!parsed.success) {
    return { error: auth.errors.invalidCredentials, message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: auth.errors.signInFailed, message: null };
  }

  redirect("/app");
}

export async function signup(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { auth } = await getDictionary();
  const parsed = loginFormSchema.safeParse(loginFormValues(formData));
  if (!parsed.success) {
    return { error: auth.errors.invalidCredentials, message: null };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
  const supabase = await createClient();

  // The language this visitor picked at the door, carried into the account
  // they are creating. It travels in user metadata rather than a follow-up
  // write because there is no session yet — sign-up may be waiting on an
  // email confirmation — and because handle_new_user() already runs at the
  // one moment when the profile exists and nobody has read it.
  //
  // Signing *in* deliberately does not do this: an existing account's
  // language is its own, and a cookie left on a shared machine must not
  // flip it.
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;

  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=/onboarding`,
      data: isAppLocale(chosen) ? { interface_locale: chosen } : undefined,
    },
  });

  return error
    ? { error: auth.errors.signUpFailed, message: null }
    : { error: null, message: auth.messages.confirmEmail };
}

export async function requestPasswordReset(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailFormSchema.safeParse({
    email: String(formData.get("email") ?? ""),
  });

  if (parsed.success) {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
    });
  }

  const { auth } = await getDictionary();
  return { error: null, message: auth.messages.resetLinkSent };
}

export async function updatePassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = updatePasswordFormSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  const { auth } = await getDictionary();
  if (!parsed.success) {
    return { error: auth.errors.passwordMismatch, message: null };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return { error: auth.errors.resetLinkExpired, message: null };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { error: auth.errors.passwordUpdateFailed, message: null };
  }

  redirect("/app");
}
