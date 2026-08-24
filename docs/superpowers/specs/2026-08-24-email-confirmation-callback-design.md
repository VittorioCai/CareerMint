# Email Confirmation Callback Design

## Problem

Supabase can confirm a new account before the application finishes exchanging the callback code for a browser session. The current callback collapses every exchange failure into “验证链接无效或已过期”, so a confirmed user is told that verification failed.

## Chosen design

Signup confirmation supports two paths. The production-default path uses Supabase's built-in `{{ .ConfirmationURL }}` template: the signup action sends `emailRedirectTo` with `?next=/onboarding`, so the default confirmation URL reaches the callback with a `code` and the existing `exchangeCodeForSession` branch opens onboarding. The optional local/custom-template path receives `token_hash`, `type=email`, and `next=/onboarding`, validates the allowed destination, and calls `verifyOtp`. This avoids depending on the PKCE verifier cookie from the browser that initiated signup.

The existing `code` callback remains supported for password recovery and already-sent legacy links. Unknown destinations always fall back to `/app`.

## User-visible behavior

- Successful signup confirmation creates a session and opens onboarding.
- Successful legacy or recovery callbacks keep their current destination behavior.
- Missing, malformed, expired, or already-used confirmation credentials return to login with a precise invalid-link message.
- A failed legacy session exchange returns to login with a neutral message explaining that the email may already be confirmed and the user should sign in, rather than asking them to register again.

## Configuration

The repository includes an optional signup confirmation HTML template and points local Supabase configuration at it. New Supabase Free projects created after 2026-06-03 can use the built-in default SMTP template without changing it or configuring SMTP now; the default ConfirmationURL-plus-code flow is supported in production. A custom template is only applicable after configuring custom SMTP or upgrading. When that optional path is used, the template link is:

`{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`

The signup action sets `emailRedirectTo` to `${siteUrl}/auth/callback?next=/onboarding`. The default template carries that URL through as a code callback; the optional custom template appends `token_hash` and `type=email` with `&`, preserving the allow-listed onboarding destination without a malformed second `?`.

## Testing

Unit-level route tests prove token verification, legacy fallback, destination allow-listing, and distinct error redirects. A login-page/component test proves that callback status is rendered with the correct message. The existing auth and full verification suites must remain green.

## Scope

This change does not alter password rules, add third-party login, resend emails, or expose Supabase errors to users.
