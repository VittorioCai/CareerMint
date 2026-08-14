"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AuthFeedback } from "@/components/auth-feedback";
import {
  requestPasswordReset,
  type AuthActionState,
} from "@/app/(auth)/login/actions";

const initialState: AuthActionState = { error: null, message: null };

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <form action={action} className="space-y-5">
      <AuthFeedback error={state.error} message={state.message} />
      <div>
        <label className="form-label" htmlFor="email">账户邮箱</label>
        <input className="form-input" id="email" name="email" type="email" autoComplete="email" placeholder="name@example.com" required />
      </div>
      <button className="button-primary min-h-12 w-full px-5 font-black disabled:cursor-wait disabled:opacity-60" type="submit" disabled={pending}>
        {pending ? "正在发送…" : "发送重设链接"}
      </button>
      <Link href="/login" className="block text-center text-sm font-bold underline decoration-[var(--mist-blue)] decoration-2 underline-offset-4">返回登录</Link>
    </form>
  );
}
