export default async function globalSetup() {
  const [authHealth, mailHealth] = await Promise.all([
    fetch("http://127.0.0.1:54321/auth/v1/health"),
    fetch("http://127.0.0.1:54324/api/v1/messages"),
  ]);

  if (!authHealth.ok || !mailHealth.ok) {
    throw new Error(
      "Local Supabase and Mailpit must be running before the E2E suite.",
    );
  }
}
