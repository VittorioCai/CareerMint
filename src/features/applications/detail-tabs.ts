export const applicationDetailTabs = [
  { id: "overview", label: "概览" },
  { id: "resume", label: "简历" },
  { id: "jd", label: "JD" },
  { id: "interview", label: "面试准备" },
  { id: "timeline", label: "时间线" },
] as const;

export type ApplicationDetailTab =
  (typeof applicationDetailTabs)[number]["id"];
