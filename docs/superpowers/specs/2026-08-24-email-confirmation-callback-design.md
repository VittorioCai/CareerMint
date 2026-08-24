# Email Confirmation Callback Design

## Problem

Supabase can confirm a new account before the application finishes exchanging the callback code for a browser session. The current callback collapses every exchange failure into “验证链接无效或已过期”, so a confirmed user is told that verification failed.

## Chosen design

Signup confirmation emails use the server-side `token_hash` flow recommended for Supabase SSR. The application receives `token_hash`, `type=email`, and `next=/onboarding`, validates the allowed destination, and calls `verifyOtp`. This avoids depending on the PKCE verifier cookie from the browser that initiated signup.

The existing `code` callback remains supported for password recovery and already-sent legacy links. Unknown destinations always fall back to `/app`.

## User-visible behavior

- Successful signup confirmation creates a session and opens onboarding.
- Successful legacy or recovery callbacks keep their current destination behavior.
- Missing, malformed, expired, or already-used confirmation credentials return to login with a precise invalid-link message.
- A failed legacy session exchange returns to login with a neutral message explaining that the email may already be confirmed and the user should sign in, rather than asking them to register again.

## Configuration

The repository includes the signup confirmation HTML template and points local Supabase configuration at it. Production Supabase must use the same template body:

`{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`

The signup action sets `emailRedirectTo` to the callback URL without query parameters. The confirmation template adds `token_hash`, `type=email`, and the allow-listed `next=/onboarding` in a single query string, avoiding malformed double-`?` URLs.

## Testing

Unit-level route tests prove token verification, legacy fallback, destination allow-listing, and distinct error redirects. A login-page/component test proves that callback status is rendered with the correct message. The existing auth and full verification suites must remain green.

## Scope

This change does not alter password rules, add third-party login, resend emails, or expose Supabase errors to users.
