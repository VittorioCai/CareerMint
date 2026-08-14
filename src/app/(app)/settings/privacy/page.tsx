import { ComingSoonPage } from "@/components/coming-soon-page";

export default function PrivacySettingsPage() {
  return (
    <ComingSoonPage
      title="AI 与数据授权"
      description="这里将说明哪些资料会发送给 AI、如何撤销授权，以及如何导出或删除数据。完整简历和 JD 不会写入普通日志。"
      nextStepHref="/app"
      nextStepLabel="返回工作台"
    />
  );
}
