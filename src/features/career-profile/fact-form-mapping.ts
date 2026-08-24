import type { CareerFact, CareerFactInput } from "./schemas";

export type FactFormField =
  | "headline"
  | "summary"
  | "role"
  | "company"
  | "startDate"
  | "endDate"
  | "responsibilities"
  | "skills"
  | "degree"
  | "school"
  | "educationDetails"
  | "projectName"
  | "projectOrganization"
  | "contribution"
  | "skillName"
  | "proficiencyContext"
  | "certificateName"
  | "issuer"
  | "obtainedDate"
  | "credentialDetails"
  | "language"
  | "proficiency"
  | "languageEvidence"
  | "outcome"
  | "metric"
  | "achievementContext"
  | "storyTitle"
  | "situation"
  | "task"
  | "action"
  | "result";

export type FactFormValues = Partial<Record<FactFormField, string>>;
export type FactType = CareerFactInput["factType"];

export class FactFormMappingError extends Error {
  constructor(
    readonly field: FactFormField,
    readonly label: string,
  ) {
    super(`请填写${label}`);
    this.name = "FactFormMappingError";
  }
}

function text(values: FactFormValues, field: FactFormField) {
  return values[field]?.trim() ?? "";
}

function required(
  values: FactFormValues,
  field: FactFormField,
  label: string,
) {
  const value = text(values, field);
  if (!value) throw new FactFormMappingError(field, label);
  return value;
}

function optional(values: FactFormValues, field: FactFormField) {
  return text(values, field) || null;
}

function skillList(values: FactFormValues) {
  return text(values, "skills")
    .split(/[,，]/)
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function normalized(
  factType: FactType,
  data: CareerFactInput["data"],
): CareerFactInput {
  return { factType, data };
}

function labeledLine(label: string, value: string) {
  return `${label}：${value}`;
}

export function mapFactFormValues(
  factType: FactType,
  values: FactFormValues,
): CareerFactInput {
  switch (factType) {
    case "summary":
      return normalized(factType, {
        title: required(values, "headline", "标题"),
        organization: null,
        startDate: null,
        endDate: null,
        description: required(values, "summary", "个人总结"),
        skills: [],
      });
    case "work_experience":
      return normalized(factType, {
        title: required(values, "role", "职位"),
        organization: required(values, "company", "公司"),
        startDate: optional(values, "startDate"),
        endDate: optional(values, "endDate"),
        description: required(values, "responsibilities", "职责与成果"),
        skills: skillList(values),
      });
    case "education":
      return normalized(factType, {
        title: required(values, "degree", "学位或专业"),
        organization: required(values, "school", "学校"),
        startDate: optional(values, "startDate"),
        endDate: optional(values, "endDate"),
        description: required(values, "educationDetails", "方向或成果"),
        skills: [],
      });
    case "project":
      return normalized(factType, {
        title: required(values, "projectName", "项目名称"),
        organization: optional(values, "projectOrganization"),
        startDate: optional(values, "startDate"),
        endDate: optional(values, "endDate"),
        description: required(values, "contribution", "贡献与结果"),
        skills: skillList(values),
      });
    case "skill": {
      const skillName = required(values, "skillName", "技能名称");
      return normalized(factType, {
        title: skillName,
        organization: null,
        startDate: null,
        endDate: null,
        description: required(values, "proficiencyContext", "熟练程度或使用场景"),
        skills: [skillName],
      });
    }
    case "certification":
      return normalized(factType, {
        title: required(values, "certificateName", "证书名称"),
        organization: required(values, "issuer", "颁发机构"),
        startDate: optional(values, "obtainedDate"),
        endDate: null,
        description: required(values, "credentialDetails", "证书详情"),
        skills: [],
      });
    case "language": {
      const lines = [
        labeledLine("熟练程度", required(values, "proficiency", "熟练程度")),
      ];
      const evidence = text(values, "languageEvidence");
      if (evidence) lines.push(labeledLine("证书或证明", evidence));
      return normalized(factType, {
        title: required(values, "language", "语言"),
        organization: null,
        startDate: null,
        endDate: null,
        description: lines.join("\n"),
        skills: [],
      });
    }
    case "achievement":
      return normalized(factType, {
        title: required(values, "outcome", "成果"),
        organization: null,
        startDate: null,
        endDate: null,
        description: [
          labeledLine("指标", required(values, "metric", "指标")),
          labeledLine("背景", required(values, "achievementContext", "背景")),
        ].join("\n"),
        skills: [],
      });
    case "story":
      return normalized(factType, {
        title: required(values, "storyTitle", "故事标题"),
        organization: null,
        startDate: null,
        endDate: null,
        description: [
          labeledLine("情境", required(values, "situation", "情境")),
          labeledLine("任务", required(values, "task", "任务")),
          labeledLine("行动", required(values, "action", "行动")),
          labeledLine("结果", required(values, "result", "结果")),
        ].join("\n"),
        skills: [],
      });
  }
}

function section(description: string, label: string, nextLabels: string[]) {
  const boundary = nextLabels.map((next) => `\n${next}：`).join("|");
  const match = description.match(
    new RegExp(`${label}：([\\s\\S]*?)(?=${boundary ? `(?:${boundary})` : "$"}|$)`),
  );
  return match?.[1]?.trim() ?? "";
}

export function factDataToFormValues(
  factType: FactType,
  data: CareerFact["data"],
): FactFormValues {
  switch (factType) {
    case "summary":
      return { headline: data.title, summary: data.description };
    case "work_experience":
      return { role: data.title, company: data.organization ?? "", startDate: data.startDate ?? "", endDate: data.endDate ?? "", responsibilities: data.description, skills: data.skills.join(", ") };
    case "education":
      return { degree: data.title, school: data.organization ?? "", startDate: data.startDate ?? "", endDate: data.endDate ?? "", educationDetails: data.description };
    case "project":
      return { projectName: data.title, projectOrganization: data.organization ?? "", startDate: data.startDate ?? "", endDate: data.endDate ?? "", contribution: data.description, skills: data.skills.join(", ") };
    case "skill":
      return { skillName: data.title, proficiencyContext: data.description };
    case "certification":
      return { certificateName: data.title, issuer: data.organization ?? "", obtainedDate: data.startDate ?? "", credentialDetails: data.description };
    case "language": {
      const proficiency = section(data.description, "熟练程度", ["证书或证明"]);
      return {
        language: data.title,
        proficiency: proficiency || data.description,
        languageEvidence: section(data.description, "证书或证明", []),
      };
    }
    case "achievement": {
      const metric = section(data.description, "指标", ["背景"]);
      return { outcome: data.title, metric: metric || data.description, achievementContext: section(data.description, "背景", []) };
    }
    case "story": {
      const situation = section(data.description, "情境", ["任务", "行动", "结果"]);
      return {
        storyTitle: data.title,
        situation: situation || data.description,
        task: section(data.description, "任务", ["行动", "结果"]),
        action: section(data.description, "行动", ["结果"]),
        result: section(data.description, "结果", []),
      };
    }
  }
}
