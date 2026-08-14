import { ComingSoonPage } from "@/components/coming-soon-page";

export default function AccountSettingsPage() {
  return (
    <ComingSoonPage
      title="账户设置"
      description="这里将集中管理姓名、邮箱、安全设置、界面语言以及数据导出和账户删除。"
      nextStepHref="/app"
      nextStepLabel="返回工作台"
    />
  );
}
