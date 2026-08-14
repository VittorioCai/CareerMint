import { ComingSoonPage } from "@/components/coming-soon-page";

export default function InterviewPage() {
  return (
    <ComingSoonPage
      title="面试题库"
      description="通用题只保留一份，职能、行业和岗位特定问题会作为增量加入；每道题都能关联事实、STAR 故事和准备状态。"
      nextStepHref="/profile"
      nextStepLabel="先完善职业档案"
    />
  );
}
