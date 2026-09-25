export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      assessment_answers: {
        Row: {
          answered_at: string | null
          attempt_id: string
          id: string
          is_correct: boolean | null
          position: number
          presented_option_order: string[]
          question_id: string
          rendered_options: Json
          rendered_prompt: string
          selected_key: string | null
        }
        Insert: {
          answered_at?: string | null
          attempt_id: string
          id?: string
          is_correct?: boolean | null
          position: number
          presented_option_order: string[]
          question_id: string
          rendered_options: Json
          rendered_prompt: string
          selected_key?: string | null
        }
        Update: {
          answered_at?: string | null
          attempt_id?: string
          id?: string
          is_correct?: boolean | null
          position?: number
          presented_option_order?: string[]
          question_id?: string
          rendered_options?: Json
          rendered_prompt?: string
          selected_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_attempts: {
        Row: {
          attempt_no: number
          dbd_record_id: string | null
          id: string
          kind: string
          language: string
          max_score: number | null
          passing_mark_snapshot: number | null
          question_ids: string[]
          result: string | null
          score: number | null
          shuffle_seed: string
          started_at: string
          status: string
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          attempt_no: number
          dbd_record_id?: string | null
          id?: string
          kind: string
          language: string
          max_score?: number | null
          passing_mark_snapshot?: number | null
          question_ids: string[]
          result?: string | null
          score?: number | null
          shuffle_seed: string
          started_at?: string
          status?: string
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          attempt_no?: number
          dbd_record_id?: string | null
          id?: string
          kind?: string
          language?: string
          max_score?: number | null
          passing_mark_snapshot?: number | null
          question_ids?: string[]
          result?: string | null
          score?: number | null
          shuffle_seed?: string
          started_at?: string
          status?: string
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempts_dbd_record_id_fkey"
            columns: ["dbd_record_id"]
            isOneToOne: false
            referencedRelation: "dbd_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      call_sessions: {
        Row: {
          created_at: string
          dbd_record_id: string
          ended_at: string | null
          id: string
          metadata: Json
          modality: string
          recording_path: string | null
          started_at: string
          status: string
          transcript: string | null
          user_id: string
          vapi_call_id: string | null
        }
        Insert: {
          created_at?: string
          dbd_record_id: string
          ended_at?: string | null
          id?: string
          metadata?: Json
          modality: string
          recording_path?: string | null
          started_at?: string
          status?: string
          transcript?: string | null
          user_id: string
          vapi_call_id?: string | null
        }
        Update: {
          created_at?: string
          dbd_record_id?: string
          ended_at?: string | null
          id?: string
          metadata?: Json
          modality?: string
          recording_path?: string | null
          started_at?: string
          status?: string
          transcript?: string | null
          user_id?: string
          vapi_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_dbd_record_id_fkey"
            columns: ["dbd_record_id"]
            isOneToOne: false
            referencedRelation: "dbd_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dbd_chunks: {
        Row: {
          char_count: number
          chunk_index: number
          chunk_text: string
          created_at: string
          document_id: string
          document_type: string | null
          id: string
          page: number
          record_id: string
        }
        Insert: {
          char_count: number
          chunk_index: number
          chunk_text: string
          created_at?: string
          document_id: string
          document_type?: string | null
          id: string
          page: number
          record_id: string
        }
        Update: {
          char_count?: number
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          document_id?: string
          document_type?: string | null
          id?: string
          page?: number
          record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dbd_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dbd_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dbd_chunks_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "dbd_records"
            referencedColumns: ["id"]
          },
        ]
      }
      dbd_documents: {
        Row: {
          document_type: string | null
          id: string
          index_error: string | null
          index_status: string
          indexed_pages: number
          original_name: string
          page_count: number | null
          path: string
          position: number
          record_id: string
          size_bytes: number
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          document_type?: string | null
          id?: string
          index_error?: string | null
          index_status?: string
          indexed_pages?: number
          original_name: string
          page_count?: number | null
          path: string
          position: number
          record_id: string
          size_bytes: number
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          document_type?: string | null
          id?: string
          index_error?: string | null
          index_status?: string
          indexed_pages?: number
          original_name?: string
          page_count?: number | null
          path?: string
          position?: number
          record_id?: string
          size_bytes?: number
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dbd_documents_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "dbd_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dbd_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dbd_pages: {
        Row: {
          document_id: string
          model: string | null
          page: number
          text: string
          transcribed_at: string
        }
        Insert: {
          document_id: string
          model?: string | null
          page: number
          text: string
          transcribed_at?: string
        }
        Update: {
          document_id?: string
          model?: string | null
          page?: number
          text?: string
          transcribed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dbd_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dbd_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      dbd_records: {
        Row: {
          certificate_no: string | null
          company_name_en: string | null
          company_name_th: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          directors: Json
          document_path: string | null
          document_ref: string | null
          extraction_raw: Json | null
          extraction_status: string
          head_office_address: string | null
          id: string
          issued_on: string | null
          issuing_office: string | null
          juristic_id: string | null
          objectives_count: number | null
          province: string | null
          registered_capital: number | null
          registered_on: string | null
          registrar_name: string | null
          signing_authority: string | null
          structured_data: Json
          team_id: string | null
          updated_at: string
        }
        Insert: {
          certificate_no?: string | null
          company_name_en?: string | null
          company_name_th?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          directors?: Json
          document_path?: string | null
          document_ref?: string | null
          extraction_raw?: Json | null
          extraction_status?: string
          head_office_address?: string | null
          id?: string
          issued_on?: string | null
          issuing_office?: string | null
          juristic_id?: string | null
          objectives_count?: number | null
          province?: string | null
          registered_capital?: number | null
          registered_on?: string | null
          registrar_name?: string | null
          signing_authority?: string | null
          structured_data?: Json
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          certificate_no?: string | null
          company_name_en?: string | null
          company_name_th?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          directors?: Json
          document_path?: string | null
          document_ref?: string | null
          extraction_raw?: Json | null
          extraction_status?: string
          head_office_address?: string | null
          id?: string
          issued_on?: string | null
          issuing_office?: string | null
          juristic_id?: string | null
          objectives_count?: number | null
          province?: string | null
          registered_capital?: number | null
          registered_on?: string | null
          registrar_name?: string | null
          signing_authority?: string | null
          structured_data?: Json
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dbd_records_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dbd_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dbd_records_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dbd_sweeps: {
        Row: {
          created_at: string
          document_id: string
          first_page: number
          last_page: number
          result: Json
        }
        Insert: {
          created_at?: string
          document_id: string
          first_page: number
          last_page: number
          result: Json
        }
        Update: {
          created_at?: string
          document_id?: string
          first_page?: number
          last_page?: number
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "dbd_sweeps_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dbd_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      eligibility_snapshots: {
        Row: {
          available_from: string
          calculated_at: string
          dbd_record_id: string
          expires_at: string | null
          id: string
          issued_on_snapshot: string
          reason: string
          user_id: string
        }
        Insert: {
          available_from: string
          calculated_at?: string
          dbd_record_id: string
          expires_at?: string | null
          id?: string
          issued_on_snapshot: string
          reason: string
          user_id: string
        }
        Update: {
          available_from?: string
          calculated_at?: string
          dbd_record_id?: string
          expires_at?: string | null
          id?: string
          issued_on_snapshot?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eligibility_snapshots_dbd_record_id_fkey"
            columns: ["dbd_record_id"]
            isOneToOne: false
            referencedRelation: "dbd_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eligibility_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      index_jobs: {
        Row: {
          attempts: number
          created_at: string
          document_id: string
          id: string
          kind: string
          last_error: string | null
          locked_until: string | null
          next_page: number
          record_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          document_id: string
          id?: string
          kind?: string
          last_error?: string | null
          locked_until?: string | null
          next_page?: number
          record_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          document_id?: string
          id?: string
          kind?: string
          last_error?: string | null
          locked_until?: string | null
          next_page?: number
          record_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "index_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dbd_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "index_jobs_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "dbd_records"
            referencedColumns: ["id"]
          },
        ]
      }
      login_id_counters: {
        Row: {
          next_value: number
          scope: string
        }
        Insert: {
          next_value?: number
          scope: string
        }
        Update: {
          next_value?: number
          scope?: string
        }
        Relationships: []
      }
      name_cards: {
        Row: {
          created_at: string
          dbd_record_id: string
          id: string
          pdf_path: string
          phone_number: string
          telegram_sent_at: string | null
          template_version: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dbd_record_id: string
          id?: string
          pdf_path: string
          phone_number: string
          telegram_sent_at?: string | null
          template_version: string
          user_id: string
        }
        Update: {
          created_at?: string
          dbd_record_id?: string
          id?: string
          pdf_path?: string
          phone_number?: string
          telegram_sent_at?: string | null
          template_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "name_cards_dbd_record_id_fkey"
            columns: ["dbd_record_id"]
            isOneToOne: false
            referencedRelation: "dbd_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "name_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          destination_ref: string | null
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          destination_ref?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          destination_ref?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      policy_config: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "policy_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          login_id: string
          manager_id: string | null
          preferred_language: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          login_id: string
          manager_id?: string | null
          preferred_language?: string
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          login_id?: string
          manager_id?: string | null
          preferred_language?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_generation_batches: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          material_summary: string
          model: string | null
          produced: number
          provider: string
          rejected: number
          requested: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_summary: string
          model?: string | null
          produced?: number
          provider: string
          rejected?: number
          requested: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_summary?: string
          model?: string | null
          produced?: number
          provider?: string
          rejected?: number
          requested?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_generation_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_localizations: {
        Row: {
          correct_key: string
          created_at: string
          explanation: string | null
          id: string
          language: string
          options: Json
          prompt: string
          question_id: string
          tts_enabled: boolean
          updated_at: string
        }
        Insert: {
          correct_key: string
          created_at?: string
          explanation?: string | null
          id?: string
          language: string
          options: Json
          prompt: string
          question_id: string
          tts_enabled?: boolean
          updated_at?: string
        }
        Update: {
          correct_key?: string
          created_at?: string
          explanation?: string | null
          id?: string
          language?: string
          options?: Json
          prompt?: string
          question_id?: string
          tts_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_localizations_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          active: boolean
          approval_status: string
          created_at: string
          created_by: string | null
          dbd_field_dependencies: string[]
          generation_batch_id: string | null
          id: string
          kind: string
          pools: string[]
          question_key: string
          source: string
          source_refs: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          approval_status?: string
          created_at?: string
          created_by?: string | null
          dbd_field_dependencies?: string[]
          generation_batch_id?: string | null
          id?: string
          kind: string
          pools?: string[]
          question_key: string
          source?: string
          source_refs?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          approval_status?: string
          created_at?: string
          created_by?: string | null
          dbd_field_dependencies?: string[]
          generation_batch_id?: string | null
          id?: string
          kind?: string
          pools?: string[]
          question_key?: string
          source?: string
          source_refs?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_generation_batch_id_fkey"
            columns: ["generation_batch_id"]
            isOneToOne: false
            referencedRelation: "question_generation_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      study_material_localizations: {
        Row: {
          body: string | null
          created_at: string
          file_path: string | null
          id: string
          language: string
          material_id: string
          title: string
          tts_enabled: boolean
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          language: string
          material_id: string
          title: string
          tts_enabled?: boolean
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          language?: string
          material_id?: string
          title?: string
          tts_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_material_localizations_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "study_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      study_materials: {
        Row: {
          active: boolean
          content_key: string
          created_at: string
          created_by: string | null
          id: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          content_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          content_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_progress: {
        Row: {
          completed_at: string | null
          first_viewed_at: string
          id: string
          last_viewed_at: string
          material_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          first_viewed_at?: string
          id?: string
          last_viewed_at?: string
          material_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          first_viewed_at?: string
          id?: string
          last_viewed_at?: string
          material_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_progress_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "study_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_dbd_assignments: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string | null
          dbd_record_id: string
          deactivated_at: string | null
          holder_name: string | null
          id: string
          position: string | null
          relationship_to_shareholders: string | null
          responsibilities: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          dbd_record_id: string
          deactivated_at?: string | null
          holder_name?: string | null
          id?: string
          position?: string | null
          relationship_to_shareholders?: string | null
          responsibilities?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          dbd_record_id?: string
          deactivated_at?: string | null
          holder_name?: string | null
          id?: string
          position?: string | null
          relationship_to_shareholders?: string | null
          responsibilities?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_dbd_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_dbd_assignments_dbd_record_id_fkey"
            columns: ["dbd_record_id"]
            isOneToOne: false
            referencedRelation: "dbd_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_dbd_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          event_type: string
          external_id: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
        }
        Insert: {
          error?: string | null
          event_type: string
          external_id: string
          id?: string
          payload: Json
          processed_at?: string | null
          provider: string
          received_at?: string
        }
        Update: {
          error?: string | null
          event_type?: string
          external_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      audit_logs_with_actor: {
        Row: {
          action: string | null
          actor_id: string | null
          actor_login_id: string | null
          after: Json | null
          before: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      allocate_login_id: {
        Args: { p_prefix: string; p_scope: string }
        Returns: string
      }
      release_login_id: {
        Args: { p_scope: string; p_value: number }
        Returns: boolean
      }
      claim_index_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          document_id: string
          id: string
          kind: string
          last_error: string | null
          locked_until: string | null
          next_page: number
          record_id: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "index_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_notifications: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          channel: string
          created_at: string
          destination_ref: string | null
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          sent_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      compute_eligibility_snapshot: {
        Args: { p_reason: string; p_record_id: string; p_user_id: string }
        Returns: undefined
      }
      finalize_attempt: {
        Args: {
          p_attempt_id: string
          p_max_score: number
          p_notifications?: Json
          p_result: string
          p_score: number
        }
        Returns: {
          attempt_no: number
          dbd_record_id: string | null
          id: string
          kind: string
          language: string
          max_score: number | null
          passing_mark_snapshot: number | null
          question_ids: string[]
          result: string | null
          score: number | null
          shuffle_seed: string
          started_at: string
          status: string
          submitted_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "assessment_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      in_my_team: { Args: { p_user: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      my_team: { Args: never; Returns: string }
      policy_int: { Args: { p_key: string }; Returns: number }
      recompute_eligibility_snapshots: {
        Args: { p_reason: string }
        Returns: number
      }
      set_my_preferred_language: {
        Args: { p_lang: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

