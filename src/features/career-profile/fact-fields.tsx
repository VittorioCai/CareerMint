import type {
  FactFormField,
  FactFormValues,
  FactType,
} from "./fact-form-mapping";

type FieldDefinition = {
  name: FactFormField;
  label: string;
  kind?: "text" | "textarea";
  placeholder?: string;
  required?: boolean;
  wide?: boolean;
};

const datePlaceholder = "YYYY 或 YYYY-MM";

export const FACT_FIELDS: Record<FactType, FieldDefinition[]> = {
  summary: [
    { name: "headline", label: "标题", required: true },
    { name: "summary", label: "个人总结", kind: "textarea", required: true, wide: true },
  ],
  work_experience: [
    { name: "role", label: "职位", required: true },
    { name: "company", label: "公司", required: true },
    { name: "startDate", label: "开始时间", placeholder: datePlaceholder },
    { name: "endDate", label: "结束时间", placeholder: "留空代表至今" },
    { name: "responsibilities", label: "职责与成果", kind: "textarea", required: true, wide: true },
    { name: "skills", label: "相关技能（逗号分隔）", wide: true },
  ],
  education: [
    { name: "degree", label: "学位或专业", required: true },
    { name: "school", label: "学校", required: true },
    { name: "startDate", label: "开始时间", placeholder: datePlaceholder },
    { name: "endDate", label: "结束时间", placeholder: datePlaceholder },
    { name: "educationDetails", label: "方向或成果", kind: "textarea", required: true, wide: true },
  ],
  project: [
    { name: "projectName", label: "项目名称", required: true },
    { name: "projectOrganization", label: "组织（可选）" },
    { name: "startDate", label: "开始时间", placeholder: datePlaceholder },
    { name: "endDate", label: "结束时间", placeholder: datePlaceholder },
    { name: "contribution", label: "贡献与结果", kind: "textarea", required: true, wide: true },
    { name: "skills", label: "相关技能（逗号分隔）", wide: true },
  ],
  skill: [
    { name: "skillName", label: "技能名称", required: true },
    { name: "proficiencyContext", label: "熟练程度或使用场景", kind: "textarea", required: true, wide: true },
  ],
  certification: [
    { name: "certificateName", label: "证书名称", required: true },
    { name: "issuer", label: "颁发机构", required: true },
    { name: "obtainedDate", label: "获得时间", placeholder: datePlaceholder },
    { name: "credentialDetails", label: "证书详情", kind: "textarea", required: true, wide: true },
  ],
  language: [
    { name: "language", label: "语言", required: true },
    { name: "proficiency", label: "熟练程度", required: true },
    { name: "languageEvidence", label: "证书或证明（可选）", wide: true },
  ],
  achievement: [
    { name: "outcome", label: "成果", required: true },
    { name: "metric", label: "指标", required: true },
    { name: "achievementContext", label: "背景", kind: "textarea", required: true, wide: true },
  ],
  story: [
    { name: "storyTitle", label: "故事标题", required: true, wide: true },
    { name: "situation", label: "情境", kind: "textarea", required: true },
    { name: "task", label: "任务", kind: "textarea", required: true },
    { name: "action", label: "行动", kind: "textarea", required: true },
    { name: "result", label: "结果", kind: "textarea", required: true },
  ],
};

export function pruneFactFormValues(
  factType: FactType,
  values: FactFormValues,
) {
  const visible = new Set(FACT_FIELDS[factType].map((field) => field.name));
  return Object.fromEntries(
    Object.entries(values).filter(([name]) => visible.has(name as FactFormField)),
  ) as FactFormValues;
}

export function FactFields({
  factType,
  values,
  errors = {},
  idPrefix,
  onChange,
}: {
  factType: FactType;
  values: FactFormValues;
  errors?: Partial<Record<FactFormField, string>>;
  idPrefix: string;
  onChange(field: FactFormField, value: string): void;
}) {
  return FACT_FIELDS[factType].map((field) => {
    const id = `${idPrefix}-${field.name}`;
    const errorId = `${id}-error`;
    const error = errors[field.name];
    const inputProps = {
      id,
      name: field.name,
      value: values[field.name] ?? "",
      placeholder: field.placeholder,
      required: field.required,
      "aria-invalid": error ? (true as const) : undefined,
      "aria-describedby": error ? errorId : undefined,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => onChange(field.name, event.target.value),
      className: `form-input mt-2 ${field.kind === "textarea" ? "min-h-28 resize-y" : ""}`,
    };
    return (
      <div key={field.name} className={field.wide ? "sm:col-span-2" : ""}>
        <label htmlFor={id} className="block text-sm font-black">
          {field.label}
        </label>
        {field.kind === "textarea" ? (
          <textarea {...inputProps} />
        ) : (
          <input {...inputProps} />
        )}
        {error ? (
          <p id={errorId} className="mt-1 text-xs font-black text-[var(--error)]">
            {error}
          </p>
        ) : null}
      </div>
    );
  });
}
