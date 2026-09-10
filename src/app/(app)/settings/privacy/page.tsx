import { PrivacyControls } from "@/features/privacy/privacy-controls";
import { getDictionary } from "@/i18n/server";

export default async function PrivacySettingsPage() {
  const { common, settings } = await getDictionary();

  return (
    <section className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{settings.eyebrow}</p>
      <h1 className="heading-font mt-2 type-page-title">{settings.privacyTitle}</h1>
      <p className="mt-3 max-w-2xl type-caption font-medium text-[var(--ink-muted)]">
        {settings.privacyBody}
      </p>
      <div className="mt-7 max-w-3xl">
        <PrivacyControls copy={settings} common={common} />
      </div>
    </section>
  );
}
