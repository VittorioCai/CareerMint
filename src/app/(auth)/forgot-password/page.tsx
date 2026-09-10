import { AuthShell } from "@/components/auth-shell";
import { getDictionary } from "@/i18n/server";

import { ResetRequestForm } from "./reset-request-form";

export default async function ForgotPasswordPage() {
  const { auth } = await getDictionary();
  return (
    <AuthShell
      eyebrow={auth.pages.forgotEyebrow}
      title={auth.pages.forgotTitle}
      description={auth.pages.forgotBody}
    >
      <ResetRequestForm copy={auth} />
    </AuthShell>
  );
}
