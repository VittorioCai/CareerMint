import { AuthShell } from "@/components/auth-shell";
import { getDictionary } from "@/i18n/server";

import { AuthForm, type CallbackError } from "./auth-form";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const { auth } = await getDictionary();
  const callbackError: CallbackError | undefined =
    params.error === "invalid-link" ||
    params.error === "session-not-created" ||
    params.error === "email-link-used"
      ? params.error
      : undefined;

  return (
    <AuthShell
      eyebrow={auth.pages.signInEyebrow}
      title={auth.pages.signInTitle}
      description={auth.pages.signInBody}
    >
      <AuthForm callbackError={callbackError} auth={auth} />
    </AuthShell>
  );
}
