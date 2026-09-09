const setupSteps = [
  { id: "saved", label: "保存 JD" },
  { id: "resume", label: "选择并预览简历" },
  { id: "jd", label: "分析 JD" },
  { id: "gap", label: "查看差距" },
] as const;

export type SetupProgressStep = (typeof setupSteps)[number]["id"];

export function SetupProgress({ current }: { current: SetupProgressStep }) {
  const currentIndex = setupSteps.findIndex((step) => step.id === current);

  return (
    <nav aria-label="申请准备进度" className="dense-surface p-3 sm:p-4">
      <ol className="grid gap-2 sm:grid-cols-4">
        {setupSteps.map((step, index) => {
          const active = index === currentIndex;
          const completed = index < currentIndex;
          return (
            <li
              key={step.id}
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
                {completed ? "✓" : index + 1}.
              </span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
