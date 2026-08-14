import { saveAccountPreferencesAction } from "@/features/account/actions";
import { getOwnedProfile } from "@/features/account/repository";
import { AccountPreferencesForm } from "@/features/account/preferences-form";
import type { AccountPreferences } from "@/features/account/schemas";
import { requireUser } from "@/lib/auth/require-user";

export default async function AccountSettingsPage() {
  const user = await requireUser();
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
      <p className="text-xs font-black uppercase tracking-[0.15em] text-[var(--ink-muted)]">账户菜单</p>
      <h1 className="heading-font mt-2 text-4xl font-black tracking-[-0.04em]">账户设置</h1>
      <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
        管理求职方向、界面偏好和 AI 文字处理授权。邮箱由登录系统维护，不能在此直接修改。
      </p>
      <div className="mt-7 max-w-3xl">
        <AccountPreferencesForm
          email={user.email ?? "已验证账户"}
          initialPreferences={preferences}
          savePreferences={saveAccountPreferencesAction}
        />
      </div>
    </section>
  );
}
