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
      claim_processing_job: {
        Args: { target_job_id: string }
        Returns: boolean
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
    }
    Enums: {
      fact_confirmation_status: "pending" | "confirmed" | "needs_detail"
      processing_job_kind: "resume_extract"
      processing_job_status: "queued" | "running" | "succeeded" | "failed"
      source_asset_status: "uploaded" | "extracting" | "ready" | "failed"
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
      fact_confirmation_status: ["pending", "confirmed", "needs_detail"],
      processing_job_kind: ["resume_extract"],
      processing_job_status: ["queued", "running", "succeeded", "failed"],
      source_asset_status: ["uploaded", "extracting", "ready", "failed"],
    },
  },
} as const

