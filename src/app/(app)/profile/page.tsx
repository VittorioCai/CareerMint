import { ComingSoonPage } from "@/components/coming-soon-page";

export default function ProfilePage() {
  return (
    <ComingSoonPage
      title="职业档案"
      description="下一阶段会支持从 PDF、DOCX 或粘贴文本提取经历、项目、技能与量化成果，再由你逐条确认来源和真实性。"
      nextStepHref="/app"
      nextStepLabel="返回首页"
    />
  );
}
