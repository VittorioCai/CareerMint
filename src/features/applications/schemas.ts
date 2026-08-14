import { z } from "zod";

export const APPLICATION_STAGES = [
  "preparing",
  "applied",
  "hr",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export const WORKPLACE_MODES = [
  "unspecified",
  "onsite",
  "hybrid",
  "remote",
] as const;

export const applicationStageSchema = z.enum(APPLICATION_STAGES);
export const workplaceModeSchema = z.enum(WORKPLACE_MODES);

export type ApplicationStage = z.infer<typeof applicationStageSchema>;
export type WorkplaceMode = z.infer<typeof workplaceModeSchema>;

export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  preparing: "准备中",
  applied: "已投递",
  hr: "HR 沟通",
  interview: "面试",
  offer: "Offer",
  rejected: "已拒绝",
  withdrawn: "已撤回",
};

export const WORKPLACE_MODE_LABELS: Record<WorkplaceMode, string> = {
  unspecified: "未说明",
  onsite: "现场办公",
  hybrid: "混合办公",
  remote: "远程办公",
};

function optionalTrimmedString(maxLength: number) {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(maxLength).nullable(),
  );
}

const optionalHttpUrlSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z
    .url()
    .max(2048)
    .refine(
      (value) => {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      },
      { message: "job-url-must-use-http" },
    )
    .nullable(),
);

export const newApplicationSchema = z.object({
  companyName: z.string().trim().min(1).max(160),
  roleTitle: z.string().trim().min(1).max(160),
  location: optionalTrimmedString(240),
  workplaceMode: workplaceModeSchema.default("unspecified"),
  source: optionalTrimmedString(120),
  jobUrl: optionalHttpUrlSchema,
  jdText: z.string().trim().min(40).max(100_000),
});

export type NewApplicationInput = z.infer<typeof newApplicationSchema>;

const stageChangeFormSchema = z.object({
  applicationId: z.uuid(),
  stage: applicationStageSchema,
  occurredOn: z.iso.date(),
  note: optionalTrimmedString(2_000),
});

export const stageChangeSchema = stageChangeFormSchema
  .refine(
    ({ occurredOn }) => occurredOn <= new Date().toISOString().slice(0, 10),
    {
      message: "stage-date-cannot-be-future",
      path: ["occurredOn"],
    },
  )
  .transform(({ occurredOn, ...input }) => ({
    ...input,
    occurredAt: `${occurredOn}T12:00:00.000Z`,
  }));

export type StageChangeInput = z.infer<typeof stageChangeSchema>;

export const applicationFilterSchema = z.object({
  view: z.enum(["board", "table"]).catch("board").default("board"),
  q: z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().max(200),
    )
    .catch("")
    .default(""),
  stage: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    applicationStageSchema.optional(),
  ),
});

export type ApplicationFilter = z.infer<typeof applicationFilterSchema>;

export type Application = {
  id: string;
  userId: string;
  companyName: string;
  roleTitle: string;
  location: string | null;
  workplaceMode: WorkplaceMode;
  source: string | null;
  jobUrl: string | null;
  jdText: string;
  stage: ApplicationStage;
  stageChangedAt: string;
  appliedAt: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationStageEvent = {
  id: string;
  applicationId: string;
  userId: string;
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage;
  occurredAt: string;
  note: string | null;
  createdAt: string;
};

export function canChangeApplicationStage(
  currentStage: ApplicationStage,
  nextStage: ApplicationStage,
): { ok: true } | { ok: false; reason: "application-stage-unchanged" } {
  if (currentStage === nextStage) {
    return { ok: false, reason: "application-stage-unchanged" };
  }
  return { ok: true };
}
