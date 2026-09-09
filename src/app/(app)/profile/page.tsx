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
          <h1 className="heading-font mt-2 type-page-title">职业档案</h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
            每条内容都保留来源和确认状态。只有你明确确认过的事实，才能被确定性写入求职材料。
          </p>
        </div>
        {/* Nothing to check is not the same as everything checked — the chip
            only claims a clean profile when there is a profile. */}
        {facts.length ? (
          <div
            className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${
              pending
                ? "border-[#e0b93a] bg-[#fffbe4]"
                : "border-[var(--mint-strong)] bg-[#eef8f2]"
            }`}
          >
            {pending ? `${pending} 条待处理` : "全部已核对"}
          </div>
        ) : null}
      </div>
      <FactList facts={facts} />
    </section>
  );
}
