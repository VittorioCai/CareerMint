import { AuthShell } from "@/components/auth-shell";

import { ResetRequestForm } from "./reset-request-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="找回账户"
      title="重设你的密码"
      description="输入注册邮箱。如果账户存在，我们会发送一次性重设链接；为保护隐私，页面不会显示邮箱是否已注册。"
    >
      <ResetRequestForm />
    </AuthShell>
  );
}
