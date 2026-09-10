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

/**
 * A required field was left empty.
 *
 * It carries the field and nothing else. This module maps form values to a
 * fact; it has no business knowing how to phrase a sentence, or in which
 * language — the caller has the dictionary and composes the message from the
 * same field labels the form itself is rendered with.
 */
export class FactFormMappingError extends Error {
  constructor(readonly field: FactFormField) {
    super(`fact-form-field-required:${field}`);
    this.name = "FactFormMappingError";
  }
}

function text(values: FactFormValues, field: FactFormField) {
  return values[field]?.trim() ?? "";
}

function required(values: FactFormValues, field: FactFormField) {
  const value = text(values, field);
  if (!value) throw new FactFormMappingError(field);
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

/**
 * Section markers written into `career_facts.data.description`.
 *
 * These are a storage format, not interface copy. A language fact is stored as
 * "熟练程度：C1\n证书或证明：TestDaF", and `section()` below parses it back out
 * by matching these exact strings. Translating them would make every fact
 * written before the change unreadable — the parser would find no marker and
 * return empty fields, silently emptying people's profiles.
 *
 * They stay in Chinese because that is what is already in the database.
 * Replacing them with a language-independent format is a data migration, not a
 * translation, and is out of scope here.
 */
const STORED_MARKERS = {
  proficiency: "熟练程度",
  certificate: "证书或证明",
  metric: "指标",
  context: "背景",
  situation: "情境",
  task: "任务",
  action: "行动",
  result: "结果",
} as const;

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
        title: required(values, "headline"),
        organization: null,
        startDate: null,
        endDate: null,
        description: required(values, "summary"),
        skills: [],
      });
    case "work_experience":
      return normalized(factType, {
        title: required(values, "role"),
        organization: required(values, "company"),
        startDate: optional(values, "startDate"),
        endDate: optional(values, "endDate"),
        description: required(values, "responsibilities"),
        skills: skillList(values),
      });
    case "education":
      return normalized(factType, {
        title: required(values, "degree"),
        organization: required(values, "school"),
        startDate: optional(values, "startDate"),
        endDate: optional(values, "endDate"),
        description: required(values, "educationDetails"),
        skills: [],
      });
    case "project":
      return normalized(factType, {
        title: required(values, "projectName"),
        organization: optional(values, "projectOrganization"),
        startDate: optional(values, "startDate"),
        endDate: optional(values, "endDate"),
        description: required(values, "contribution"),
        skills: skillList(values),
      });
    case "skill": {
      const skillName = required(values, "skillName");
      return normalized(factType, {
        title: skillName,
        organization: null,
        startDate: null,
        endDate: null,
        description: required(values, "proficiencyContext"),
        skills: [skillName],
      });
    }
    case "certification":
      return normalized(factType, {
        title: required(values, "certificateName"),
        organization: required(values, "issuer"),
        startDate: optional(values, "obtainedDate"),
        endDate: null,
        description: required(values, "credentialDetails"),
        skills: [],
      });
    case "language": {
      const lines = [
        labeledLine(STORED_MARKERS.proficiency, required(values, "proficiency")),
      ];
      const evidence = text(values, "languageEvidence");
      if (evidence) lines.push(labeledLine(STORED_MARKERS.certificate, evidence));
      return normalized(factType, {
        title: required(values, "language"),
        organization: null,
        startDate: null,
        endDate: null,
        description: lines.join("\n"),
        skills: [],
      });
    }
    case "achievement":
      return normalized(factType, {
        title: required(values, "outcome"),
        organization: null,
        startDate: null,
        endDate: null,
        description: [
          labeledLine(STORED_MARKERS.metric, required(values, "metric")),
          labeledLine(STORED_MARKERS.context, required(values, "achievementContext")),
        ].join("\n"),
        skills: [],
      });
    case "story":
      return normalized(factType, {
        title: required(values, "storyTitle"),
        organization: null,
        startDate: null,
        endDate: null,
        description: [
          labeledLine(STORED_MARKERS.situation, required(values, "situation")),
          labeledLine(STORED_MARKERS.task, required(values, "task")),
          labeledLine(STORED_MARKERS.action, required(values, "action")),
          labeledLine(STORED_MARKERS.result, required(values, "result")),
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
      const proficiency = section(data.description, STORED_MARKERS.proficiency, [STORED_MARKERS.certificate]);
      return {
        language: data.title,
        proficiency: proficiency || data.description,
        languageEvidence: section(data.description, STORED_MARKERS.certificate, []),
      };
    }
    case "achievement": {
      const metric = section(data.description, STORED_MARKERS.metric, [STORED_MARKERS.context]);
      return { outcome: data.title, metric: metric || data.description, achievementContext: section(data.description, STORED_MARKERS.context, []) };
    }
    case "story": {
      const situation = section(data.description, STORED_MARKERS.situation, [STORED_MARKERS.task, STORED_MARKERS.action, STORED_MARKERS.result]);
      return {
        storyTitle: data.title,
        situation: situation || data.description,
        task: section(data.description, STORED_MARKERS.task, [STORED_MARKERS.action, STORED_MARKERS.result]),
        action: section(data.description, STORED_MARKERS.action, [STORED_MARKERS.result]),
        result: section(data.description, STORED_MARKERS.result, []),
      };
    }
  }
}
