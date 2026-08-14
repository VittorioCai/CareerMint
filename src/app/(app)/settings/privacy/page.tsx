import { PrivacyControls } from "@/features/privacy/privacy-controls";

export default function PrivacySettingsPage() {
  return (
    <section className="min-w-0">
      <p className="text-xs font-black uppercase tracking-[0.15em] text-[var(--ink-muted)]">账户菜单</p>
      <h1 className="heading-font mt-2 text-4xl font-black tracking-[-0.04em]">数据与隐私</h1>
      <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
        你的数据可以随时导出或删除。普通日志不会记录完整简历、JD 或模型响应正文。
      </p>
      <div className="mt-7 max-w-3xl">
        <PrivacyControls />
      </div>
    </section>
  );
}
