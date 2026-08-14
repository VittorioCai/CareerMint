import { ComingSoonPage } from "@/components/coming-soon-page";

export default function OnboardingPage() {
  return (
    <ComingSoonPage
      title="开始建立职业档案"
      description="账户已确认。下一阶段将在这里收集目标岗位、国家与求职语言，并支持上传已有简历开始事实提取。"
      nextStepHref="/app"
      nextStepLabel="先进入工作台"
    />
  );
}
