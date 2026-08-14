import { FactList } from "@/features/career-profile/fact-list";
import { careerFactRepository } from "@/features/career-profile/repository";
import { requireUser } from "@/lib/auth/require-user";

export default async function ProfilePage() {
  const user = await requireUser();
  const facts = await careerFactRepository.list(user.id);
  const pending = facts.filter(
    (fact) => fact.confirmationStatus !== "confirmed",
  ).length;

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.15em] text-[var(--ink-muted)]">事实资料库</p>
          <h1 className="heading-font mt-2 text-4xl font-black tracking-[-0.04em]">职业档案</h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
            每条内容都保留来源和确认状态。只有你明确确认过的事实，才能被确定性写入求职材料。
          </p>
        </div>
        <div className={`w-fit rounded-full border border-[var(--ink)] px-3 py-1.5 text-xs font-black ${pending ? "bg-[var(--cream)]" : "bg-[var(--mint)]"}`}>
          {pending ? `${pending} 条待处理` : "全部已核对"}
        </div>
      </div>
      <FactList facts={facts} />
    </section>
  );
}
