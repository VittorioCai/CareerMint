import { createApplicationAction } from "@/features/applications/actions";
import { ApplicationDraftForm } from "@/features/applications/application-draft-form";

export default function NewApplicationPage() {
  return (
    <section className="min-w-0">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.15em] text-[var(--ink-muted)]">
            新建申请 · Step 1
          </p>
          <h1 className="heading-font mt-2 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
            先把岗位稳稳收进来
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
            保存公司、职位和完整 JD，建立独立申请工作区。当前版本不会自动抓取招聘网站，也不会在输入时调用 AI。
          </p>
        </div>
        <aside className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--mist-blue)] p-4 shadow-[3px_3px_0_var(--ink)]">
          <p className="text-xs font-black uppercase tracking-[0.12em]">数据边界</p>
          <p className="mt-2 text-sm font-bold leading-6">
            JD 原文只保存在你的私有工作区，不写入普通应用日志。
          </p>
        </aside>
      </div>

      <ol className="mt-7 grid gap-2 sm:grid-cols-5" aria-label="新建申请步骤">
        {["添加 JD", "解析要求", "匹配档案", "补充资料", "建立工作区"].map(
          (label, index) => (
            <li
              key={label}
              className={`rounded-xl border px-3 py-3 text-xs font-black ${
                index === 0
                  ? "border-2 border-[var(--ink)] bg-[var(--cream)] shadow-[2px_2px_0_var(--ink)]"
                  : "border-[var(--line)] bg-white text-[var(--ink-muted)]"
              }`}
            >
              <span className="mr-1.5">{index + 1}.</span>
              {label}
            </li>
          ),
        )}
      </ol>

      <div className="dense-surface mt-6 p-4 sm:p-7">
        <ApplicationDraftForm
          createApplication={createApplicationAction.bind(null, {})}
        />
      </div>
    </section>
  );
}
