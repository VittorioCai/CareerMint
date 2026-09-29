import { AuthShell } from "@/components/auth-shell";
import { getDictionary } from "@/i18n/server";

import { AuthForm, type AuthMode, type CallbackError } from "./auth-form";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; mode?: string }>;
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

  // A callback error is about an account that already exists, so it is always
  // read on the sign-in side whatever the query string asks for.
  const mode: AuthMode =
    params.mode === "signup" && !callbackError ? "signUp" : "signIn";

  return (
    <AuthShell
      eyebrow={mode === "signUp" ? auth.pages.signUpEyebrow : auth.pages.signInEyebrow}
      title={mode === "signUp" ? auth.pages.signUpTitle : auth.pages.signInTitle}
      description={mode === "signUp" ? auth.pages.signUpBody : auth.pages.signInBody}
    >
      <AuthForm callbackError={callbackError} auth={auth} mode={mode} />
    </AuthShell>
  );
}
