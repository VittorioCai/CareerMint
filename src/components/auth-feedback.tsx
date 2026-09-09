type AuthFeedbackProps = {
  error?: string | null;
  message?: string | null;
};

export function AuthFeedback({ error, message }: AuthFeedbackProps) {
  if (!error && !message) return null;

  return (
    <p
      role={error ? "alert" : "status"}
      className={`rounded-xl border px-3.5 py-3 text-sm font-bold ${
        error
          ? "bg-[var(--danger-tint)] text-[var(--danger)]"
          : "bg-[var(--sev-matched)] text-[var(--sev-matched-ink)]"
      }`}
    >
      {error ?? message}
    </p>
  );
}
