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
          ? "border-[var(--error)] bg-[#fff0ee] text-[var(--error)]"
          : "border-[var(--mint-strong)] bg-[#effbf5] text-[var(--ink)]"
      }`}
    >
      {error ?? message}
    </p>
  );
}
