import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import {
  applicationStageSchema,
  workplaceModeSchema,
  type Application,
  type ApplicationStageEvent,
  type NewApplicationInput,
  type StageChangeInput,
} from "./schemas";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type ApplicationStageEventRow =
  Database["public"]["Tables"]["application_stage_events"]["Row"];

export type ApplicationRepository = {
  create(input: NewApplicationInput): Promise<Application>;
  list(userId: string): Promise<Application[]>;
  get(userId: string, applicationId: string): Promise<Application | null>;
  listEvents(
    userId: string,
    applicationId: string,
  ): Promise<ApplicationStageEvent[]>;
  changeStage(input: StageChangeInput): Promise<Application>;
};

export class ApplicationRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ApplicationRepositoryError";
  }
}

function stableStorageError(error: { code?: string; message?: string } | null) {
  if (error?.code === "P0002" || error?.code === "PGRST116") {
    return "application-not-found";
  }
  if (
    error?.code === "P0001" &&
    error.message?.includes("application-stage-unchanged")
  ) {
    return "application-stage-unchanged";
  }
  if (error?.code === "22023" || error?.code === "23514") {
    return "invalid-application-input";
  }
  return "application-storage-error";
}

function toApplication(row: ApplicationRow): Application {
  const stage = applicationStageSchema.safeParse(row.stage);
  const workplaceMode = workplaceModeSchema.safeParse(row.workplace_mode);
  if (!stage.success || !workplaceMode.success) {
    throw new ApplicationRepositoryError("invalid-stored-application");
  }

  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    roleTitle: row.role_title,
    location: row.location,
    workplaceMode: workplaceMode.data,
    source: row.source,
    jobUrl: row.job_url,
    jdText: row.jd_text,
    stage: stage.data,
    stageChangedAt: row.stage_changed_at,
    appliedAt: row.applied_at,
    nextAction: row.next_action,
    nextActionDueAt: row.next_action_due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApplicationStageEvent(
  row: ApplicationStageEventRow,
): ApplicationStageEvent {
  const fromStage = row.from_stage
    ? applicationStageSchema.safeParse(row.from_stage)
    : null;
  const toStage = applicationStageSchema.safeParse(row.to_stage);
  if ((fromStage && !fromStage.success) || !toStage.success) {
    throw new ApplicationRepositoryError("invalid-stored-application-event");
  }

  return {
    id: row.id,
    applicationId: row.application_id,
    userId: row.user_id,
    fromStage: fromStage ? fromStage.data : null,
    toStage: toStage.data,
    occurredAt: row.occurred_at,
    note: row.note,
    createdAt: row.created_at,
  };
}

async function create(input: NewApplicationInput): Promise<Application> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_application", {
    target_company_name: input.companyName,
    target_role_title: input.roleTitle,
    target_location: input.location ?? "",
    target_workplace_mode: input.workplaceMode,
    target_source: input.source ?? "",
    target_job_url: input.jobUrl ?? "",
    target_jd_text: input.jdText,
  });

  if (error || !data) {
    throw new ApplicationRepositoryError(stableStorageError(error));
  }
  return toApplication(data);
}

async function list(userId: string): Promise<Application[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw new ApplicationRepositoryError(stableStorageError(error));
  return (data ?? []).map(toApplication);
}

async function get(
  userId: string,
  applicationId: string,
): Promise<Application | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", userId)
    .eq("id", applicationId)
    .maybeSingle();

  if (error) throw new ApplicationRepositoryError(stableStorageError(error));
  return data ? toApplication(data) : null;
}

async function listEvents(
  userId: string,
  applicationId: string,
): Promise<ApplicationStageEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application_stage_events")
    .select("*")
    .eq("user_id", userId)
    .eq("application_id", applicationId)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new ApplicationRepositoryError(stableStorageError(error));
  return (data ?? []).map(toApplicationStageEvent);
}

async function changeStage(input: StageChangeInput): Promise<Application> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_application_stage", {
    target_application_id: input.applicationId,
    target_stage: input.stage,
    target_occurred_at: input.occurredAt,
    target_note: input.note ?? "",
  });

  if (error || !data) {
    throw new ApplicationRepositoryError(stableStorageError(error));
  }
  return toApplication(data);
}

export const applicationRepository: ApplicationRepository = {
  create,
  list,
  get,
  listEvents,
  changeStage,
};
