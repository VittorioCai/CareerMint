import { ComingSoonPage } from "@/components/coming-soon-page";

export default function ApplicationsPage() {
  return (
    <ComingSoonPage
      title="我的投递"
      description="这里会提供看板和表格双视图，跟踪准备中、已投递、HR 沟通、面试与 Offer，并记录每次阶段变化。"
      nextStepHref="/profile"
      nextStepLabel="先完善职业档案"
    />
  );
}
