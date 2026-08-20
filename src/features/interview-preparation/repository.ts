import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { listConfirmedFactsForAnalysis } from "@/features/jd-analysis/repository";

import {
  interviewPreparationStatusSchema,
  interviewQuestionCategorySchema,
  interviewQuestionSourceSchema,
  type InterviewQuestion,
} from "./schemas";

type QuestionRow = Database["public"]["Tables"]["interview_questions"]["Row"];

export class InterviewPreparationRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "InterviewPreparationRepositoryError";
  }
}

function stableError(error: { code?: string } | null) {
  if (error?.code === "P0002" || error?.code === "PGRST116") {
    return "interview-resource-not-found";
  }
  if (error?.code === "22023" || error?.code === "23514") {
    return "invalid-interview-operation";
  }
  if (error?.code === "23505") return "interview-operation-conflict";
  return "interview-storage-error";
}

async function list(userId: string): Promise<InterviewQuestion[]> {
  const supabase = await createClient();
  const [
    { data: questions, error },
    { data: variants, error: variantsError },
    { data: links, error: linksError },
    { data: factLinks, error: factLinksError },
    facts,
  ] = await Promise.all([
    supabase
      .from("interview_questions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("interview_question_variants")
      .select("id, question_id, wording")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("application_interview_questions")
      .select("application_id, question_id, predicted, relevance_reason")
      .eq("user_id", userId),
    supabase
      .from("interview_question_facts")
      .select("question_id, career_fact_id")
      .eq("user_id", userId),
    listConfirmedFactsForAnalysis(userId),
  ]);
  if (error || variantsError || linksError || factLinksError) {
    throw new InterviewPreparationRepositoryError(
      stableError(error ?? variantsError ?? linksError ?? factLinksError),
    );
  }

  const variantsByQuestion = new Map<
    string,
    InterviewQuestion["variants"]
  >();
  for (const variant of variants ?? []) {
    const current = variantsByQuestion.get(variant.question_id) ?? [];
    current.push({ id: variant.id, wording: variant.wording });
    variantsByQuestion.set(variant.question_id, current);
  }
  const linksByQuestion = new Map<
    string,
    InterviewQuestion["applicationLinks"]
  >();
  for (const link of links ?? []) {
    const current = linksByQuestion.get(link.question_id) ?? [];
    current.push({
      applicationId: link.application_id,
      predicted: link.predicted,
      relevanceReason: link.relevance_reason,
    });
    linksByQuestion.set(link.question_id, current);
  }
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const factsByQuestion = new Map<string, InterviewQuestion["facts"]>();
  for (const link of factLinks ?? []) {
    const fact = factsById.get(link.career_fact_id);
    if (!fact) continue;
    const current = factsByQuestion.get(link.question_id) ?? [];
    current.push(fact);
    factsByQuestion.set(link.question_id, current);
  }

  return (questions ?? []).map((row: QuestionRow) => {
    const category = interviewQuestionCategorySchema.safeParse(row.category);
    const source = interviewQuestionSourceSchema.safeParse(row.source);
    const status = interviewPreparationStatusSchema.safeParse(
      row.preparation_status,
    );
    if (!category.success || !source.success || !status.success) {
      throw new InterviewPreparationRepositoryError(
        "invalid-stored-interview-question",
      );
    }
    return {
      id: row.id,
      userId: row.user_id,
      category: category.data,
      canonicalKey: row.canonical_key,
      prompt: row.prompt,
      source: source.data,
      preparationStatus: status.data,
      answerOutline: row.answer_outline,
      notes: row.notes,
      variants: variantsByQuestion.get(row.id) ?? [],
      applicationLinks: linksByQuestion.get(row.id) ?? [],
      facts: factsByQuestion.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

async function listForApplication(userId: string, applicationId: string) {
  const questions = await list(userId);
  return questions.filter(
    (question) =>
      question.category === "common" ||
      question.applicationLinks.some(
        (link) => link.applicationId === applicationId,
      ),
  );
}

async function create(input: {
  prompt: string;
  category: "common" | "function" | "industry" | "job_specific";
  applicationId: string | null;
}): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_interview_question", {
    target_prompt: input.prompt,
    target_category: input.category,
    target_application_id: input.applicationId ?? undefined,
    target_relevance_reason: undefined,
  });
  if (error || !data) {
    throw new InterviewPreparationRepositoryError(stableError(error));
  }
  return { id: data.id };
}

async function updatePreparation(input: {
  questionId: string;
  preparationStatus: "not_started" | "outlined" | "practiced" | "ready";
  answerOutline: string | null;
  notes: string | null;
  factIds: string[];
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "save_interview_question_preparation",
    {
      target_question_id: input.questionId,
      target_preparation_status: input.preparationStatus,
      target_answer_outline: input.answerOutline ?? "",
      target_notes: input.notes ?? "",
      target_fact_ids: input.factIds,
    },
  );
  if (error) {
    throw new InterviewPreparationRepositoryError(stableError(error));
  }
}

async function addVariant(input: {
  questionId: string;
  wording: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_interview_question_variant", {
    target_question_id: input.questionId,
    target_wording: input.wording,
  });
  if (error) {
    throw new InterviewPreparationRepositoryError(stableError(error));
  }
}

export const interviewPreparationRepository = {
  list,
  listForApplication,
  create,
  updatePreparation,
  addVariant,
};
