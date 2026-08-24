"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AuthFeedback } from "@/components/auth-feedback";

import { login, signup, type AuthActionState } from "./actions";

const initialState: AuthActionState = { error: null, message: null };

export type CallbackError =
  | "invalid-link"
  | "session-not-created"
  | "email-link-used";

const callbackMessages: Record<CallbackError, string> = {
  "invalid-link": "验证链接无效或已过期，请重新申请",
  "session-not-created": "邮箱可能已完成验证，请使用邮箱和密码登录",
  "email-link-used": "邮箱已完成注册，验证链接可能已使用或已过期。返回登录即可。",
};

export function AuthForm({ callbackError }: { callbackError?: CallbackError }) {
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
            ? callbackMessages[callbackError]
            : state.error
        }
        message={
          consumedEmailLink
            ? callbackMessages[callbackError]
            : callbackError
              ? null
              : state.message
        }
      />

      {callbackError === "email-link-used" ? (
        <Link href="/login" className="button-secondary block min-h-12 px-5 text-center font-black">
          返回登录
        </Link>
      ) : null}

      <div>
        <label className="form-label" htmlFor="email">邮箱</label>
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
          <label className="form-label mb-0" htmlFor="password">密码</label>
          <Link href="/forgot-password" className="text-sm font-bold underline decoration-[var(--mist-blue)] decoration-2 underline-offset-4 hover:text-[var(--ink-muted)]">忘记密码？</Link>
        </div>
        <input
          className="form-input"
          id="password"
          name="password"
          type="password"
          minLength={8}
          maxLength={128}
          autoComplete="current-password"
          placeholder="至少 8 位"
          required
        />
      </div>

      <div className="grid gap-3 pt-1 sm:grid-cols-2">
        <button className="button-primary min-h-12 px-5 font-black disabled:cursor-wait disabled:opacity-60" type="submit" formAction={loginAction} disabled={pending}>
          {loginPending ? "正在登录…" : "登录"}
        </button>
        <button className="button-secondary min-h-12 px-5 font-black disabled:cursor-wait disabled:opacity-60" type="submit" formAction={signupAction} disabled={pending}>
          {signupPending ? "正在创建…" : "注册新账户"}
        </button>
      </div>

      <p className="text-xs font-medium leading-5 text-[var(--ink-muted)]">注册后我们会发送邮箱验证链接。MVP 暂不提供第三方登录。</p>
    </form>
  );
}
