export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      application_analysis_runs: {
        Row: {
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        Insert: {
          application_id: string
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_hash: string
          model: string
          provider: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        Update: {
          application_id?: string
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_hash?: string
          model?: string
          provider?: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_analysis_runs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_interview_questions: {
        Row: {
          application_id: string
          created_at: string
          predicted: boolean
          question_id: string
          relevance_reason: string | null
          source_excerpt: string | null
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          predicted?: boolean
          question_id: string
          relevance_reason?: string | null
          source_excerpt?: string | null
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          predicted?: boolean
          question_id?: string
          relevance_reason?: string | null
          source_excerpt?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_interview_questions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_interview_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      application_requirement_evidence: {
        Row: {
          application_id: string
          career_fact_id: string
          created_at: string
          requirement_id: string
          user_id: string
        }
        Insert: {
          application_id: string
          career_fact_id: string
          created_at?: string
          requirement_id: string
          user_id: string
        }
        Update: {
          application_id?: string
          career_fact_id?: string
          created_at?: string
          requirement_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_requirement_evidence_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_requirement_evidence_career_fact_id_fkey"
            columns: ["career_fact_id"]
            isOneToOne: false
            referencedRelation: "career_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_requirement_evidence_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "application_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      application_requirements: {
        Row: {
          analysis_run_id: string
          application_id: string
          category: string
          created_at: string
          id: string
          match_reason: string | null
          match_status: string
          priority: string
          requirement_text: string
          sort_order: number
          source_excerpt: string
          user_id: string
        }
        Insert: {
          analysis_run_id: string
          application_id: string
          category: string
          created_at?: string
          id?: string
          match_reason?: string | null
          match_status: string
          priority: string
          requirement_text: string
          sort_order: number
          source_excerpt: string
          user_id: string
        }
        Update: {
          analysis_run_id?: string
          application_id?: string
          category?: string
          created_at?: string
          id?: string
          match_reason?: string | null
          match_status?: string
          priority?: string
          requirement_text?: string
          sort_order?: number
          source_excerpt?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_requirements_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "application_analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_requirements_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_stage_events: {
        Row: {
          application_id: string
          created_at: string
          from_stage: Database["public"]["Enums"]["application_stage"] | null
          id: string
          note: string | null
          occurred_at: string
          to_stage: Database["public"]["Enums"]["application_stage"]
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["application_stage"] | null
          id?: string
          note?: string | null
          occurred_at: string
          to_stage: Database["public"]["Enums"]["application_stage"]
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["application_stage"] | null
          id?: string
          note?: string | null
          occurred_at?: string
          to_stage?: Database["public"]["Enums"]["application_stage"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_stage_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string | null
          company_name: string
          created_at: string
          id: string
          jd_text: string
          job_url: string | null
          location: string | null
          next_action: string | null
          next_action_due_at: string | null
          resume_source_asset_id: string | null
          role_title: string
          source: string | null
          stage: Database["public"]["Enums"]["application_stage"]
          stage_changed_at: string
          updated_at: string
          user_id: string
          workplace_mode: Database["public"]["Enums"]["workplace_mode"]
        }
        Insert: {
          applied_at?: string | null
          company_name: string
          created_at?: string
          id?: string
          jd_text: string
          job_url?: string | null
          location?: string | null
          next_action?: string | null
          next_action_due_at?: string | null
          resume_source_asset_id?: string | null
          role_title: string
          source?: string | null
          stage?: Database["public"]["Enums"]["application_stage"]
          stage_changed_at?: string
          updated_at?: string
          user_id: string
          workplace_mode?: Database["public"]["Enums"]["workplace_mode"]
        }
        Update: {
          applied_at?: string | null
          company_name?: string
          created_at?: string
          id?: string
          jd_text?: string
          job_url?: string | null
          location?: string | null
          next_action?: string | null
          next_action_due_at?: string | null
          resume_source_asset_id?: string | null
          role_title?: string
          source?: string | null
          stage?: Database["public"]["Enums"]["application_stage"]
          stage_changed_at?: string
          updated_at?: string
          user_id?: string
          workplace_mode?: Database["public"]["Enums"]["workplace_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "applications_resume_source_asset_id_fkey"
            columns: ["resume_source_asset_id"]
            isOneToOne: false
            referencedRelation: "source_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      career_facts: {
        Row: {
          confirmation_status: Database["public"]["Enums"]["fact_confirmation_status"]
          confirmed_at: string | null
          created_at: string
          data: Json
          fact_type: string
          id: string
          source_asset_id: string | null
          source_excerpt: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmation_status?: Database["public"]["Enums"]["fact_confirmation_status"]
          confirmed_at?: string | null
          created_at?: string
          data: Json
          fact_type: string
          id?: string
          source_asset_id?: string | null
          source_excerpt?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confirmation_status?: Database["public"]["Enums"]["fact_confirmation_status"]
          confirmed_at?: string | null
          created_at?: string
          data?: Json
          fact_type?: string
          id?: string
          source_asset_id?: string | null
          source_excerpt?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_facts_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "source_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_question_candidates: {
        Row: {
          application_id: string
          canonical_key: string
          category: string
          created_at: string
          id: string
          prompt: string
          question_id: string | null
          relevance_reason: string
          run_id: string
          sort_order: number
          source_excerpt: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          canonical_key: string
          category: string
          created_at?: string
          id?: string
          prompt: string
          question_id?: string | null
          relevance_reason: string
          run_id: string
          sort_order: number
          source_excerpt: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          canonical_key?: string
          category?: string
          created_at?: string
          id?: string
          prompt?: string
          question_id?: string | null
          relevance_reason?: string
          run_id?: string
          sort_order?: number
          source_excerpt?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_question_candidates_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_question_candidates_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_question_candidates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "interview_question_generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_question_facts: {
        Row: {
          career_fact_id: string
          created_at: string
          question_id: string
          user_id: string
        }
        Insert: {
          career_fact_id: string
          created_at?: string
          question_id: string
          user_id: string
        }
        Update: {
          career_fact_id?: string
          created_at?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_question_facts_career_fact_id_fkey"
            columns: ["career_fact_id"]
            isOneToOne: false
            referencedRelation: "career_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_question_facts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_question_generation_runs: {
        Row: {
          application_id: string
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost: Json | null
          id: string
          input_cache_hit_tokens: number
          input_cache_miss_tokens: number
          input_hash: string
          model: string
          output_tokens: number
          provider: string
          request_id: string | null
          result: Json | null
          schema_version: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost?: Json | null
          id?: string
          input_cache_hit_tokens?: number
          input_cache_miss_tokens?: number
          input_hash: string
          model: string
          output_tokens?: number
          provider: string
          request_id?: string | null
          result?: Json | null
          schema_version: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost?: Json | null
          id?: string
          input_cache_hit_tokens?: number
          input_cache_miss_tokens?: number
          input_hash?: string
          model?: string
          output_tokens?: number
          provider?: string
          request_id?: string | null
          result?: Json | null
          schema_version?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_question_generation_runs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_question_variants: {
        Row: {
          created_at: string
          id: string
          question_id: string
          user_id: string
          wording: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          user_id: string
          wording: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
          wording?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_question_variants_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_questions: {
        Row: {
          answer_outline: string | null
          canonical_key: string
          category: string
          created_at: string
          id: string
          notes: string | null
          preparation_status: string
          prompt: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_outline?: string | null
          canonical_key: string
          category: string
          created_at?: string
          id?: string
          notes?: string | null
          preparation_status?: string
          prompt: string
          source: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_outline?: string | null
          canonical_key?: string
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          preparation_status?: string
          prompt?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      processing_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          entity_id: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["processing_job_kind"]
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          entity_id: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["processing_job_kind"]
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          entity_id?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          kind?: Database["public"]["Enums"]["processing_job_kind"]
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_processing_consent_at: string | null
          created_at: string
          display_name: string | null
          interface_locale: string
          job_search_language: string
          onboarding_completed_at: string | null
          target_countries: string[]
          target_role: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_processing_consent_at?: string | null
          created_at?: string
          display_name?: string | null
          interface_locale?: string
          job_search_language?: string
          onboarding_completed_at?: string | null
          target_countries?: string[]
          target_role?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_processing_consent_at?: string | null
          created_at?: string
          display_name?: string | null
          interface_locale?: string
          job_search_language?: string
          onboarding_completed_at?: string | null
          target_countries?: string[]
          target_role?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resume_gap_items: {
        Row: {
          application_id: string
          category: string
          created_at: string
          id: string
          jd_source_excerpt: string
          priority: string
          requirement_id: string | null
          requirement_text: string
          resume_coverage: Database["public"]["Enums"]["resume_coverage"]
          run_id: string
          sort_order: number
          user_id: string
          verified_resume_excerpt: string | null
        }
        Insert: {
          application_id: string
          category: string
          created_at?: string
          id?: string
          jd_source_excerpt: string
          priority: string
          requirement_id?: string | null
          requirement_text: string
          resume_coverage: Database["public"]["Enums"]["resume_coverage"]
          run_id: string
          sort_order: number
          user_id: string
          verified_resume_excerpt?: string | null
        }
        Update: {
          application_id?: string
          category?: string
          created_at?: string
          id?: string
          jd_source_excerpt?: string
          priority?: string
          requirement_id?: string | null
          requirement_text?: string
          resume_coverage?: Database["public"]["Enums"]["resume_coverage"]
          run_id?: string
          sort_order?: number
          user_id?: string
          verified_resume_excerpt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resume_gap_items_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_gap_items_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "application_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_gap_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "resume_gap_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_gap_runs: {
        Row: {
          analysis_run_id: string
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          source_asset_id: string | null
          source_filename: string
          source_sha256: string
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_run_id: string
          application_id: string
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_hash: string
          model: string
          provider: string
          result?: Json | null
          source_asset_id?: string | null
          source_filename: string
          source_sha256: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_run_id?: string
          application_id?: string
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_hash?: string
          model?: string
          provider?: string
          result?: Json | null
          source_asset_id?: string | null
          source_filename?: string
          source_sha256?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_gap_runs_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "application_analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_gap_runs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_gap_runs_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "source_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_generation_runs: {
        Row: {
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        Insert: {
          application_id: string
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_hash: string
          model: string
          provider: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        Update: {
          application_id?: string
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_hash?: string
          model?: string
          provider?: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_generation_runs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_suggestion_facts: {
        Row: {
          application_id: string
          career_fact_id: string
          created_at: string
          run_id: string
          suggestion_id: string
          user_id: string
        }
        Insert: {
          application_id: string
          career_fact_id: string
          created_at?: string
          run_id: string
          suggestion_id: string
          user_id: string
        }
        Update: {
          application_id?: string
          career_fact_id?: string
          created_at?: string
          run_id?: string
          suggestion_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_suggestion_facts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_suggestion_facts_career_fact_id_fkey"
            columns: ["career_fact_id"]
            isOneToOne: false
            referencedRelation: "career_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_suggestion_facts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "resume_generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_suggestion_facts_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "resume_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_suggestion_requirements: {
        Row: {
          application_id: string
          created_at: string
          requirement_id: string
          run_id: string
          suggestion_id: string
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          requirement_id: string
          run_id: string
          suggestion_id: string
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          requirement_id?: string
          run_id?: string
          suggestion_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_suggestion_requirements_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_suggestion_requirements_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "application_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_suggestion_requirements_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "resume_generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_suggestion_requirements_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "resume_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_suggestions: {
        Row: {
          application_id: string
          content: string
          created_at: string
          decision: string
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_content: string | null
          run_id: string
          section: string
          sort_order: number
          user_id: string
        }
        Insert: {
          application_id: string
          content: string
          created_at?: string
          decision?: string
          id?: string
          reason: string
          reviewed_at?: string | null
          reviewed_content?: string | null
          run_id: string
          section: string
          sort_order: number
          user_id: string
        }
        Update: {
          application_id?: string
          content?: string
          created_at?: string
          decision?: string
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_content?: string | null
          run_id?: string
          section?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_suggestions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_suggestions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "resume_generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_version_item_evidence: {
        Row: {
          application_id: string
          career_fact_id: string | null
          created_at: string
          fact_snapshot: Json
          item_id: string
          user_id: string
        }
        Insert: {
          application_id: string
          career_fact_id?: string | null
          created_at?: string
          fact_snapshot: Json
          item_id: string
          user_id: string
        }
        Update: {
          application_id?: string
          career_fact_id?: string | null
          created_at?: string
          fact_snapshot?: Json
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_version_item_evidence_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_version_item_evidence_career_fact_id_fkey"
            columns: ["career_fact_id"]
            isOneToOne: false
            referencedRelation: "career_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_version_item_evidence_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "resume_version_items"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_version_items: {
        Row: {
          application_id: string
          content: string
          created_at: string
          id: string
          reason: string
          section: string
          sort_order: number
          user_id: string
          version_id: string
        }
        Insert: {
          application_id: string
          content: string
          created_at?: string
          id?: string
          reason: string
          section: string
          sort_order: number
          user_id: string
          version_id: string
        }
        Update: {
          application_id?: string
          content?: string
          created_at?: string
          id?: string
          reason?: string
          section?: string
          sort_order?: number
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_version_items_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_version_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_versions: {
        Row: {
          application_id: string
          created_at: string
          id: string
          source_run_id: string
          template: string
          user_id: string
          version_number: number
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          source_run_id: string
          template?: string
          user_id: string
          version_number: number
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          source_run_id?: string
          template?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_versions_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "resume_generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      source_assets: {
        Row: {
          content_type: string
          created_at: string
          error_code: string | null
          id: string
          original_name: string
          sha256: string
          size_bytes: number
          status: Database["public"]["Enums"]["source_asset_status"]
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_type: string
          created_at?: string
          error_code?: string | null
          id?: string
          original_name: string
          sha256: string
          size_bytes: number
          status?: Database["public"]["Enums"]["source_asset_status"]
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_type?: string
          created_at?: string
          error_code?: string | null
          id?: string
          original_name?: string
          sha256?: string
          size_bytes?: number
          status?: Database["public"]["Enums"]["source_asset_status"]
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_interview_question_candidates: {
        Args: { target_application_id: string; target_candidate_ids: string[] }
        Returns: {
          candidate_id: string
          disposition: string
          question_id: string
        }[]
      }
      add_interview_question: {
        Args: {
          target_application_id?: string
          target_category: string
          target_prompt: string
          target_relevance_reason?: string
        }
        Returns: {
          answer_outline: string | null
          canonical_key: string
          category: string
          created_at: string
          id: string
          notes: string | null
          preparation_status: string
          prompt: string
          source: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "interview_questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_interview_question_variant: {
        Args: { target_question_id: string; target_wording: string }
        Returns: {
          created_at: string
          id: string
          question_id: string
          user_id: string
          wording: string
        }
        SetofOptions: {
          from: "*"
          to: "interview_question_variants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_application_stage: {
        Args: {
          target_application_id: string
          target_note: string
          target_occurred_at: string
          target_stage: Database["public"]["Enums"]["application_stage"]
        }
        Returns: {
          applied_at: string | null
          company_name: string
          created_at: string
          id: string
          jd_text: string
          job_url: string | null
          location: string | null
          next_action: string | null
          next_action_due_at: string | null
          resume_source_asset_id: string | null
          role_title: string
          source: string | null
          stage: Database["public"]["Enums"]["application_stage"]
          stage_changed_at: string
          updated_at: string
          user_id: string
          workplace_mode: Database["public"]["Enums"]["workplace_mode"]
        }
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_application_analysis: {
        Args: { target_run_id: string }
        Returns: boolean
      }
      claim_interview_question_generation: {
        Args: {
          expected_attempt_count: number
          expected_status: string
          target_run_id: string
        }
        Returns: boolean
      }
      claim_processing_job: {
        Args: { target_job_id: string }
        Returns: boolean
      }
      claim_resume_gap: {
        Args: { target_lease_seconds: number; target_run_id: string }
        Returns: boolean
      }
      claim_resume_generation: {
        Args: { target_run_id: string }
        Returns: boolean
      }
      complete_application_analysis: {
        Args: {
          accepted_requirements: Json
          ai_usage: Json
          estimated_cost: Json
          rejected_evidence_count: number
          rejected_requirement_count: number
          target_run_id: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "application_analysis_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_interview_question_generation: {
        Args: {
          expected_attempt_count: number
          target_ai_usage: Json
          target_candidates: Json
          target_estimated_cost: Json
          target_rejected_candidate_count: number
          target_request_id: string
          target_run_id: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost: Json | null
          id: string
          input_cache_hit_tokens: number
          input_cache_miss_tokens: number
          input_hash: string
          model: string
          output_tokens: number
          provider: string
          request_id: string | null
          result: Json | null
          schema_version: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "interview_question_generation_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_resume_extraction: {
        Args: {
          accepted_count: number
          accepted_facts: Json
          ai_usage: Json
          estimated_cost: Json
          rejected_count: number
          target_asset_id: string
          target_job_id: string
        }
        Returns: {
          attempt_count: number
          created_at: string
          entity_id: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["processing_job_kind"]
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "processing_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_resume_gap: {
        Args: {
          target_ai_usage: Json
          target_attempt_count: number
          target_estimated_cost: Json
          target_items: Json
          target_run_id: string
        }
        Returns: {
          analysis_run_id: string
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          source_asset_id: string | null
          source_filename: string
          source_sha256: string
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "resume_gap_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_resume_generation: {
        Args: {
          accepted_suggestions: Json
          ai_usage: Json
          estimated_cost: Json
          rejected_reference_count: number
          rejected_suggestion_count: number
          target_run_id: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "resume_generation_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_application: {
        Args: {
          target_company_name: string
          target_jd_text: string
          target_job_url: string
          target_location: string
          target_role_title: string
          target_source: string
          target_workplace_mode: Database["public"]["Enums"]["workplace_mode"]
        }
        Returns: {
          applied_at: string | null
          company_name: string
          created_at: string
          id: string
          jd_text: string
          job_url: string | null
          location: string | null
          next_action: string | null
          next_action_due_at: string | null
          resume_source_asset_id: string | null
          role_title: string
          source: string | null
          stage: Database["public"]["Enums"]["application_stage"]
          stage_changed_at: string
          updated_at: string
          user_id: string
          workplace_mode: Database["public"]["Enums"]["workplace_mode"]
        }
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_or_get_application_analysis: {
        Args: {
          target_application_id: string
          target_input_hash: string
          target_model: string
          target_provider: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "application_analysis_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_or_get_interview_question_generation: {
        Args: {
          target_application_id: string
          target_input_hash: string
          target_model: string
          target_provider: string
          target_schema_version: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost: Json | null
          id: string
          input_cache_hit_tokens: number
          input_cache_miss_tokens: number
          input_hash: string
          model: string
          output_tokens: number
          provider: string
          request_id: string | null
          result: Json | null
          schema_version: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "interview_question_generation_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_or_get_resume_gap: {
        Args: {
          target_analysis_run_id: string
          target_application_id: string
          target_input_hash: string
          target_model: string
          target_provider: string
          target_source_asset_id: string
        }
        Returns: {
          analysis_run_id: string
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          source_asset_id: string | null
          source_filename: string
          source_sha256: string
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "resume_gap_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_or_get_resume_generation: {
        Args: {
          target_application_id: string
          target_input_hash: string
          target_model: string
          target_provider: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "resume_generation_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_or_get_resume_job: {
        Args: { target_asset_id: string; target_key: string }
        Returns: {
          attempt_count: number
          created_at: string
          entity_id: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["processing_job_kind"]
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "processing_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_resume_version: {
        Args: {
          target_application_id: string
          target_source_run_id: string
          target_template: string
        }
        Returns: {
          application_id: string
          created_at: string
          id: string
          source_run_id: string
          template: string
          user_id: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "resume_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_application_analysis: {
        Args: {
          target_error_code: string
          target_error_message: string
          target_run_id: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "application_analysis_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_interview_question_generation: {
        Args: {
          expected_attempt_count: number
          target_error_code: string
          target_error_message: string
          target_request_id: string
          target_run_id: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost: Json | null
          id: string
          input_cache_hit_tokens: number
          input_cache_miss_tokens: number
          input_hash: string
          model: string
          output_tokens: number
          provider: string
          request_id: string | null
          result: Json | null
          schema_version: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "interview_question_generation_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_resume_extraction: {
        Args: {
          target_asset_id: string
          target_error_code: string
          target_error_message: string
          target_job_id: string
        }
        Returns: {
          attempt_count: number
          created_at: string
          entity_id: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["processing_job_kind"]
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "processing_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_resume_gap: {
        Args: {
          target_attempt_count: number
          target_error_code: string
          target_error_message: string
          target_run_id: string
        }
        Returns: {
          analysis_run_id: string
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          source_asset_id: string | null
          source_filename: string
          source_sha256: string
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "resume_gap_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_resume_generation: {
        Args: {
          target_error_code: string
          target_error_message: string
          target_run_id: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_hash: string
          model: string
          provider: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "resume_generation_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      link_interview_question_to_application: {
        Args: {
          target_application_id: string
          target_predicted?: boolean
          target_question_id: string
          target_relevance_reason?: string
        }
        Returns: {
          application_id: string
          created_at: string
          predicted: boolean
          question_id: string
          relevance_reason: string | null
          source_excerpt: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "application_interview_questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      normalize_interview_question_generation_text: {
        Args: { target_text: string }
        Returns: string
      }
      normalize_interview_question_prompt: {
        Args: { target_prompt: string }
        Returns: string
      }
      reject_interview_question_candidates: {
        Args: { target_candidate_ids: string[]; target_run_id: string }
        Returns: number
      }
      replace_interview_question_facts: {
        Args: { target_fact_ids: string[]; target_question_id: string }
        Returns: number
      }
      review_resume_suggestion: {
        Args: {
          target_decision: string
          target_reviewed_content: string
          target_suggestion_id: string
        }
        Returns: {
          application_id: string
          content: string
          created_at: string
          decision: string
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_content: string | null
          run_id: string
          section: string
          sort_order: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "resume_suggestions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_interview_question_preparation: {
        Args: {
          target_answer_outline: string
          target_fact_ids: string[]
          target_notes: string
          target_preparation_status: string
          target_question_id: string
        }
        Returns: {
          answer_outline: string | null
          canonical_key: string
          category: string
          created_at: string
          id: string
          notes: string | null
          preparation_status: string
          prompt: string
          source: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "interview_questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      seed_interview_common_questions: {
        Args: { target_user_id: string }
        Returns: number
      }
      set_application_resume_source: {
        Args: { target_application_id: string; target_source_asset_id: string }
        Returns: {
          applied_at: string | null
          company_name: string
          created_at: string
          id: string
          jd_text: string
          job_url: string | null
          location: string | null
          next_action: string | null
          next_action_due_at: string | null
          resume_source_asset_id: string | null
          role_title: string
          source: string | null
          stage: Database["public"]["Enums"]["application_stage"]
          stage_changed_at: string
          updated_at: string
          user_id: string
          workplace_mode: Database["public"]["Enums"]["workplace_mode"]
        }
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_interview_question: {
        Args: {
          target_answer_outline: string
          target_notes: string
          target_preparation_status: string
          target_question_id: string
        }
        Returns: {
          answer_outline: string | null
          canonical_key: string
          category: string
          created_at: string
          id: string
          notes: string | null
          preparation_status: string
          prompt: string
          source: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "interview_questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      application_stage:
        | "preparing"
        | "applied"
        | "hr"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn"
      fact_confirmation_status: "pending" | "confirmed" | "needs_detail"
      processing_job_kind: "resume_extract"
      processing_job_status: "queued" | "running" | "succeeded" | "failed"
      resume_coverage: "covered" | "partial" | "missing"
      source_asset_status: "uploaded" | "extracting" | "ready" | "failed"
      workplace_mode: "unspecified" | "onsite" | "hybrid" | "remote"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      application_stage: [
        "preparing",
        "applied",
        "hr",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
      ],
      fact_confirmation_status: ["pending", "confirmed", "needs_detail"],
      processing_job_kind: ["resume_extract"],
      processing_job_status: ["queued", "running", "succeeded", "failed"],
      resume_coverage: ["covered", "partial", "missing"],
      source_asset_status: ["uploaded", "extracting", "ready", "failed"],
      workplace_mode: ["unspecified", "onsite", "hybrid", "remote"],
    },
  },
} as const

