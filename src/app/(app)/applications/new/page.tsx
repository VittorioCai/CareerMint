import { ComingSoonPage } from "@/components/coming-soon-page";

export default function NewApplicationPage() {
  return (
    <ComingSoonPage
      title="新建申请"
      description="完整流程将从粘贴 JD 开始，依次完成岗位解析、事实匹配、高价值补充问题，并建立独立申请工作区。"
      nextStepHref="/profile"
      nextStepLabel="先完善职业档案"
    />
  );
}
