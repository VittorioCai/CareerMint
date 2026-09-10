import type { Dictionary } from "@/i18n/dictionaries/en";

// The step order is the product's, not the copy's: the labels move to the
// dictionary but the sequence — and the fact that both entry points use this
// one list — stays here.
const setupSteps = ["saved", "resume", "jd", "gap"] as const;

export type SetupProgressStep = (typeof setupSteps)[number];

export function SetupProgress({
  current,
  copy,
}: {
  current: SetupProgressStep;
  copy: Dictionary["applications"]["setup"];
}) {
  const currentIndex = setupSteps.indexOf(current);

  return (
    <nav aria-label={copy.label} className="dense-surface p-3 sm:p-4">
      <ol className="grid gap-2 sm:grid-cols-4">
        {setupSteps.map((step, index) => {
          const active = index === currentIndex;
          const completed = index < currentIndex;
          return (
            <li
              key={step}
              aria-current={active ? "step" : undefined}
              className={`rounded-xl border px-3 py-3 text-xs font-semibold ${
                active
                  ? "border-[var(--line)] bg-[var(--paper)] shadow-[var(--elevation-1)]"
                  : completed
                    ? "border-transparent bg-[var(--sev-matched)] text-[var(--sev-matched-ink)]"
                    : "border-transparent bg-[var(--surface-muted)] text-[var(--ink-muted)]"
              }`}
            >
              <span className="mr-1.5" aria-hidden="true">
                {completed ? "\u2713" : index + 1}.
              </span>
              <span>{copy[step]}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
