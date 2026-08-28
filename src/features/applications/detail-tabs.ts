export const applicationDetailTabs = [
  { id: "overview", label: "概览" },
  { id: "resume", label: "简历" },
  { id: "difference", label: "差异分析" },
  { id: "improvements", label: "完善建议" },
  { id: "interview", label: "面试准备" },
  { id: "timeline", label: "时间线" },
] as const;

export type ApplicationDetailTab =
  (typeof applicationDetailTabs)[number]["id"];

export function resolveApplicationDetailTab(
  value: string | undefined,
): ApplicationDetailTab {
  if (value === "jd") return "difference";
  return applicationDetailTabs.some((tab) => tab.id === value)
    ? (value as ApplicationDetailTab)
    : "overview";
}
