import { saveAccountPreferencesAction } from "@/features/account/actions";
import { getOwnedProfile } from "@/features/account/repository";
import { AccountPreferencesForm } from "@/features/account/preferences-form";
import type { AccountPreferences } from "@/features/account/schemas";
import { getDictionary } from "@/i18n/server";
import { requireUser } from "@/lib/auth/require-user";

export default async function AccountSettingsPage() {
  const user = await requireUser();
  const { common, settings } = await getDictionary();
  const profile = await getOwnedProfile(user.id);
  if (!profile) throw new Error("profile-not-found");
  const preferences: AccountPreferences = {
    displayName: profile.displayName ?? "",
    interfaceLocale: profile.interfaceLocale === "en" ? "en" : "zh-CN",
    timezone: profile.timezone,
    targetRole: profile.targetRole ?? "",
    targetCountries: profile.targetCountries,
    jobSearchLanguage: "en",
    aiProcessingAllowed: Boolean(profile.aiProcessingConsentAt),
  };

  return (
    <section className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{settings.eyebrow}</p>
      <h1 className="heading-font mt-2 type-page-title">{settings.accountTitle}</h1>
      <p className="mt-3 max-w-2xl type-caption font-medium text-[var(--ink-muted)]">
        {settings.accountBody}
      </p>
      <div className="mt-7 max-w-3xl">
        <AccountPreferencesForm
          email={user.email ?? common.verifiedAccount}
          initialPreferences={preferences}
          savePreferences={saveAccountPreferencesAction}
          copy={settings}
        />
      </div>
    </section>
  );
}
