import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import {
  buildCareerFactUpdate,
  careerFactDataSchema,
  factStatusSchema,
  factTypeSchema,
  type CareerFact,
  type CareerFactInput,
} from "./schemas";

export type CareerFactRepository = {
  list(userId: string): Promise<CareerFact[]>;
  create(userId: string, input: CareerFactInput): Promise<CareerFact>;
  update(
    userId: string,
    factId: string,
    input: CareerFactInput,
  ): Promise<CareerFact>;
  setStatus(
    userId: string,
    factId: string,
    status: "pending" | "confirmed" | "needs_detail",
  ): Promise<CareerFact>;
  remove(userId: string, factId: string): Promise<void>;
};

export class CareerFactRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "CareerFactRepositoryError";
  }
}

type CareerFactRow = {
  id: string;
  user_id: string;
  source_asset_id: string | null;
  fact_type: string;
  data: Json;
  source_excerpt: string | null;
  confirmation_status: string;
  confirmed_at: string | null;
};

function stableStorageError(error: { code?: string } | null) {
  if (error?.code === "PGRST116") return "fact-not-found";
  if (error?.code === "23505") return "fact-conflict";
  return "career-fact-storage-error";
}

function toCareerFact(row: CareerFactRow): CareerFact {
  const data = careerFactDataSchema.safeParse(row.data);
  const factType = factTypeSchema.safeParse(row.fact_type);
  const status = factStatusSchema.safeParse(row.confirmation_status);

  if (!data.success || !factType.success || !status.success) {
    throw new CareerFactRepositoryError("invalid-stored-career-fact");
  }

  return {
    id: row.id,
    userId: row.user_id,
    sourceAssetId: row.source_asset_id,
    factType: factType.data,
    data: data.data,
    sourceExcerpt: row.source_excerpt,
    confirmationStatus: status.data,
    confirmedAt: row.confirmed_at,
  };
}

async function list(userId: string): Promise<CareerFact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("career_facts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new CareerFactRepositoryError(stableStorageError(error));
  return (data ?? []).map(toCareerFact);
}

async function create(
  userId: string,
  input: CareerFactInput,
): Promise<CareerFact> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("career_facts")
    .insert({
      user_id: userId,
      fact_type: input.factType,
      data: input.data as Json,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new CareerFactRepositoryError(stableStorageError(error));
  }
  return toCareerFact(data);
}

async function update(
  userId: string,
  factId: string,
  input: CareerFactInput,
): Promise<CareerFact> {
  const values = buildCareerFactUpdate(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("career_facts")
    .update({ ...values, data: values.data as Json })
    .eq("user_id", userId)
    .eq("id", factId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new CareerFactRepositoryError(
      data ? stableStorageError(error) : "fact-not-found",
    );
  }
  return toCareerFact(data);
}

async function setStatus(
  userId: string,
  factId: string,
  status: "pending" | "confirmed" | "needs_detail",
): Promise<CareerFact> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("career_facts")
    .update({
      confirmation_status: status,
      confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
    })
    .eq("user_id", userId)
    .eq("id", factId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new CareerFactRepositoryError(
      data ? stableStorageError(error) : "fact-not-found",
    );
  }
  return toCareerFact(data);
}

async function remove(userId: string, factId: string): Promise<void> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("career_facts")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", factId);

  if (error) throw new CareerFactRepositoryError(stableStorageError(error));
  if (count === 0) throw new CareerFactRepositoryError("fact-not-found");
}

export const careerFactRepository: CareerFactRepository = {
  list,
  create,
  update,
  setStatus,
  remove,
};
