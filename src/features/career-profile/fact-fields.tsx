import type { Dictionary } from "@/i18n/dictionaries/en";

import type {
  FactFormField,
  FactFormValues,
  FactType,
} from "./fact-form-mapping";

type FieldLabels = Dictionary["profile"]["fields"];

/**
 * A field definition names its label rather than spelling it, so the same
 * table serves both languages. `placeholder` is a key too — "YYYY or YYYY-MM"
 * differs between them, and "leave empty for present" is a sentence.
 */
type FieldDefinition = {
  name: FactFormField;
  label: keyof FieldLabels;
  kind?: "text" | "textarea";
  placeholder?: keyof FieldLabels;
  required?: boolean;
  wide?: boolean;
};

export const FACT_FIELDS: Record<FactType, FieldDefinition[]> = {
  summary: [
    { name: "headline", label: "headline", required: true },
    { name: "summary", label: "summary", kind: "textarea", required: true, wide: true },
  ],
  work_experience: [
    { name: "role", label: "role", required: true },
    { name: "company", label: "company", required: true },
    { name: "startDate", label: "startDate", placeholder: "datePlaceholder" },
    { name: "endDate", label: "endDate", placeholder: "endDateOpen" },
    { name: "responsibilities", label: "responsibilities", kind: "textarea", required: true, wide: true },
    { name: "skills", label: "skills", wide: true },
  ],
  education: [
    { name: "degree", label: "degree", required: true },
    { name: "school", label: "school", required: true },
    { name: "startDate", label: "startDate", placeholder: "datePlaceholder" },
    { name: "endDate", label: "endDate", placeholder: "datePlaceholder" },
    { name: "educationDetails", label: "educationDetails", kind: "textarea", required: true, wide: true },
  ],
  project: [
    { name: "projectName", label: "projectName", required: true },
    { name: "projectOrganization", label: "projectOrganization" },
    { name: "startDate", label: "startDate", placeholder: "datePlaceholder" },
    { name: "endDate", label: "endDate", placeholder: "datePlaceholder" },
    { name: "contribution", label: "contribution", kind: "textarea", required: true, wide: true },
    { name: "skills", label: "skills", wide: true },
  ],
  skill: [
    { name: "skillName", label: "skillName", required: true },
    { name: "proficiencyContext", label: "proficiencyContext", kind: "textarea", required: true, wide: true },
  ],
  certification: [
    { name: "certificateName", label: "certificateName", required: true },
    { name: "issuer", label: "issuer", required: true },
    { name: "obtainedDate", label: "obtainedDate", placeholder: "datePlaceholder" },
    { name: "credentialDetails", label: "credentialDetails", kind: "textarea", required: true, wide: true },
  ],
  language: [
    { name: "language", label: "language", required: true },
    { name: "proficiency", label: "proficiency", required: true },
    { name: "languageEvidence", label: "languageEvidence", wide: true },
  ],
  achievement: [
    { name: "outcome", label: "outcome", required: true },
    { name: "metric", label: "metric", required: true },
    { name: "achievementContext", label: "achievementContext", kind: "textarea", required: true, wide: true },
  ],
  story: [
    { name: "storyTitle", label: "storyTitle", required: true, wide: true },
    { name: "situation", label: "situation", kind: "textarea", required: true },
    { name: "task", label: "task", kind: "textarea", required: true },
    { name: "action", label: "action", kind: "textarea", required: true },
    { name: "result", label: "result", kind: "textarea", required: true },
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
  labels,
  onChange,
}: {
  factType: FactType;
  values: FactFormValues;
  errors?: Partial<Record<FactFormField, string>>;
  idPrefix: string;
  labels: FieldLabels;
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
      placeholder: field.placeholder ? labels[field.placeholder] : undefined,
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
        <label htmlFor={id} className="block text-sm font-semibold">
          {labels[field.label]}
        </label>
        {field.kind === "textarea" ? (
          <textarea {...inputProps} />
        ) : (
          <input {...inputProps} />
        )}
        {error ? (
          <p id={errorId} className="mt-1 text-xs font-semibold text-[var(--error)]">
            {error}
          </p>
        ) : null}
      </div>
    );
  });
}
