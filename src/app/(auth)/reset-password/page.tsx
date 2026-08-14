import { AuthShell } from "@/components/auth-shell";

import { UpdatePasswordForm } from "./update-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="账户安全"
      title="设置一个新密码"
      description="新密码需要 8–128 位。提交后会直接回到你的求职工作台。"
    >
      <UpdatePasswordForm />
    </AuthShell>
  );
}
