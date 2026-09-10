import { FactList } from "@/features/career-profile/fact-list";
import { careerFactRepository } from "@/features/career-profile/repository";
import { getDictionary } from "@/i18n/server";
import { requireUser } from "@/lib/auth/require-user";

export default async function ProfilePage() {
  const user = await requireUser();
  const facts = await careerFactRepository.list(user.id);
  const { common, profile } = await getDictionary();
  const pending = facts.filter(
    (fact) => fact.confirmationStatus !== "confirmed",
  ).length;

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{profile.pageEyebrow}</p>
          <h1 className="heading-font mt-2 type-page-title">{profile.pageTitle}</h1>
          <p className="mt-3 max-w-2xl type-caption font-medium text-[var(--ink-muted)]">
            {profile.pageBody}
          </p>
        </div>
        {/* Nothing to check is not the same as everything checked — the chip
            only claims a clean profile when there is a profile. */}
        {facts.length ? (
          <div
            className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${
              pending
                ? "severity-important"
                : "severity-matched"
            }`}
          >
            {pending
              ? profile.pendingCount.replace("{count}", String(pending))
              : profile.allChecked}
          </div>
        ) : null}
      </div>
      <FactList facts={facts} copy={profile} common={common} />
    </section>
  );
}
