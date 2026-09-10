import { AuthShell } from "@/components/auth-shell";
import { getDictionary } from "@/i18n/server";

import { UpdatePasswordForm } from "./update-password-form";

export default async function ResetPasswordPage() {
  const { auth } = await getDictionary();
  return (
    <AuthShell
      eyebrow={auth.pages.resetEyebrow}
      title={auth.pages.resetTitle}
      description={auth.pages.resetBody}
    >
      <UpdatePasswordForm />
    </AuthShell>
  );
}
