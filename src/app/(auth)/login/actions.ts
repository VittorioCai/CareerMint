"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isAppLocale, LOCALE_COOKIE } from "@/i18n/locale";
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

const neutralResetMessage = "如果该邮箱存在，我们已发送重设链接";

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
  const parsed = loginFormSchema.safeParse(loginFormValues(formData));
  if (!parsed.success) {
    return { error: "请输入有效邮箱和至少 8 位密码", message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "邮箱或密码不正确", message: null };
  }

  redirect("/app");
}

export async function signup(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginFormSchema.safeParse(loginFormValues(formData));
  if (!parsed.success) {
    return { error: "请输入有效邮箱和至少 8 位密码", message: null };
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
    ? { error: "注册失败，请稍后重试", message: null }
    : { error: null, message: "请检查邮箱并完成确认" };
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

  return { error: null, message: neutralResetMessage };
}

export async function updatePassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = updatePasswordFormSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!parsed.success) {
    return { error: "请输入两次相同的 8–128 位密码", message: null };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return { error: "重设链接已失效，请重新申请", message: null };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { error: "密码更新失败，请重新申请重设链接", message: null };
  }

  redirect("/app");
}
