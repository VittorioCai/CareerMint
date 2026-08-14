import Link from "next/link";
import { redirect } from "next/navigation";

import {
  completeOnboardingAction,
  saveAccountPreferencesAction,
} from "@/features/account/actions";
import { getOwnedProfile } from "@/features/account/repository";
import type { AccountPreferences } from "@/features/account/schemas";
import { careerFactRepository } from "@/features/career-profile/repository";
import { OnboardingForm } from "@/features/onboarding/onboarding-form";
import { requireUser } from "@/lib/auth/require-user";

export default async function OnboardingPage() {
  const user = await requireUser();
  const profile = await getOwnedProfile(user.id);
  if (profile?.onboardingCompletedAt) redirect("/app");
  const facts = await careerFactRepository.list(user.id);
  const initialPreferences: AccountPreferences = {
    displayName: profile?.displayName ?? "",
    interfaceLocale: profile?.interfaceLocale === "en" ? "en" : "zh-CN",
    timezone: profile?.timezone ?? "UTC",
    targetRole: profile?.targetRole ?? "",
    targetCountries: profile?.targetCountries ?? [],
    jobSearchLanguage: "en",
    aiProcessingAllowed: Boolean(profile?.aiProcessingConsentAt),
  };

  return (
    <main className="landing-shell min-h-screen min-w-0 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl min-w-0">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="logo-mark flex size-10 items-center justify-center bg-[var(--cream)] text-lg font-black">J</span>
            <span className="heading-font text-lg font-black">求职搭子</span>
          </Link>
          <span className="rounded-full border border-[var(--ink)] bg-white px-3 py-1 text-xs font-black">私密建档</span>
        </header>
        <section className="mt-9">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--ink-muted)]">Career profile setup</p>
          <h1 className="heading-font mt-2 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">先把真实经历整理清楚</h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
            大约 5 分钟。上传和 AI 分析都可以跳过，最后由你明确决定何时进入工作台。
          </p>
        </section>
        <div className="mt-7">
          <OnboardingForm
            initialPreferences={initialPreferences}
            factCount={facts.length}
            savePreferences={saveAccountPreferencesAction}
            completeOnboarding={completeOnboardingAction}
          />
        </div>
      </div>
    </main>
  );
}
