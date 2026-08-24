import { AuthShell } from "@/components/auth-shell";

import { AuthForm, type CallbackError } from "./auth-form";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackError: CallbackError | undefined =
    params.error === "invalid-link" ||
    params.error === "session-not-created" ||
    params.error === "email-link-used"
      ? params.error
      : undefined;

  return (
    <AuthShell
      eyebrow="账户入口"
      title="欢迎回来，继续准备下一次申请。"
      description="登录已有账户，或用邮箱创建新账户。你的职业事实、申请版本和投递记录都会保存在自己的工作区。"
    >
      <AuthForm callbackError={callbackError} />
    </AuthShell>
  );
}
