export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      deposit_accounts: {
        Row: {
          account_number: string
          active: boolean
          bank: string
          country: string | null
          currency: string
          holder: string
          id: string
          instructions: string
        }
        Insert: {
          account_number: string
          active?: boolean
          bank: string
          country?: string | null
          currency: string
          holder: string
          id?: string
          instructions?: string
        }
        Update: {
          account_number?: string
          active?: boolean
          bank?: string
          country?: string | null
          currency?: string
          holder?: string
          id?: string
          instructions?: string
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          active: boolean
          commission_percent: number
          from_currency: string
          id: string
          max_amount: number
          min_amount: number
          rate: number
          to_currency: string
          valid_until: string
        }
        Insert: {
          active?: boolean
          commission_percent: number
          from_currency: string
          id?: string
          max_amount?: number
          min_amount?: number
          rate: number
          to_currency: string
          valid_until: string
        }
        Update: {
          active?: boolean
          commission_percent?: number
          from_currency?: string
          id?: string
          max_amount?: number
          min_amount?: number
          rate?: number
          to_currency?: string
          valid_until?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          beta_attempts: number
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          document_type: string
          email_attempted_at: string | null
          email_attempts: number
          email_checked_at: string | null
          email_error: string | null
          email_next_attempt_at: string | null
          email_processing_at: string | null
          email_provider_id: string | null
          email_recipient: string | null
          email_request_started_at: string | null
          email_sent_at: string | null
          email_status: string
          environment: string
          error: string | null
          external_id: string | null
          id: string
          issuer_country: string
          next_attempt_at: string | null
          number: string | null
          pdf_path: string | null
          processing_at: string | null
          status: string
          transfer_id: string
          xml_path: string | null
        }
        Insert: {
          beta_attempts?: number
          beta_prepared?: Json | null
          beta_result?: Json | null
          beta_sent_at?: string | null
          cdr_path?: string | null
          created_at?: string
          delivered_at?: string | null
          document_type?: string
          email_attempted_at?: string | null
          email_attempts?: number
          email_checked_at?: string | null
          email_error?: string | null
          email_next_attempt_at?: string | null
          email_processing_at?: string | null
          email_provider_id?: string | null
          email_recipient?: string | null
          email_request_started_at?: string | null
          email_sent_at?: string | null
          email_status?: string
          environment?: string
          error?: string | null
          external_id?: string | null
          id?: string
          issuer_country?: string
          next_attempt_at?: string | null
          number?: string | null
          pdf_path?: string | null
          processing_at?: string | null
          status?: string
          transfer_id: string
          xml_path?: string | null
        }
        Update: {
          beta_attempts?: number
          beta_prepared?: Json | null
          beta_result?: Json | null
          beta_sent_at?: string | null
          cdr_path?: string | null
          created_at?: string
          delivered_at?: string | null
          document_type?: string
          email_attempted_at?: string | null
          email_attempts?: number
          email_checked_at?: string | null
          email_error?: string | null
          email_next_attempt_at?: string | null
          email_processing_at?: string | null
          email_provider_id?: string | null
          email_recipient?: string | null
          email_request_started_at?: string | null
          email_sent_at?: string | null
          email_status?: string
          environment?: string
          error?: string | null
          external_id?: string | null
          id?: string
          issuer_country?: string
          next_attempt_at?: string | null
          number?: string | null
          pdf_path?: string | null
          processing_at?: string | null
          status?: string
          transfer_id?: string
          xml_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: true
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_recipients: {
        Row: {
          country: string
          created_at: string
          currency: string
          id: string
          label: string
          recipient_account: string
          recipient_account_holder: string
          recipient_account_holder_document: string
          recipient_account_type: string
          recipient_bank: string
          recipient_bank_branch: string
          recipient_document: string
          recipient_name: string
          recipient_phone: string
          recipient_relationship: string
          updated_at: string
          user_id: string
        }
        Insert: {
          country: string
          created_at?: string
          currency: string
          id?: string
          label: string
          recipient_account: string
          recipient_account_holder: string
          recipient_account_holder_document: string
          recipient_account_type: string
          recipient_bank: string
          recipient_bank_branch?: string
          recipient_document: string
          recipient_name: string
          recipient_phone?: string
          recipient_relationship?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          country?: string
          created_at?: string
          currency?: string
          id?: string
          label?: string
          recipient_account?: string
          recipient_account_holder?: string
          recipient_account_holder_document?: string
          recipient_account_type?: string
          recipient_bank?: string
          recipient_bank_branch?: string
          recipient_document?: string
          recipient_name?: string
          recipient_phone?: string
          recipient_relationship?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_members: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transfer_events: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: number
          note: string
          transfer_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: never
          note?: string
          transfer_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: never
          note?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_events_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          amount: number
          billing_country: string
          billing_document: string
          billing_document_type: string
          billing_email: string | null
          billing_email_verified: boolean
          billing_name: string
          billing_type: string
          commission: number
          created_at: string
          customer_document: string
          customer_document_type: string | null
          customer_email: string
          customer_email_verified: boolean
          customer_name: string
          customer_phone: string
          deposit_bank_reference: string | null
          deposit_instructions: Json
          destination_country: string | null
          from_currency: string
          funds_declared_at: string | null
          funds_detail: string | null
          funds_origin: string | null
          id: string
          origin_bank: string | null
          payout_at: string | null
          payout_path: string | null
          payout_reference: string | null
          proof_path: string | null
          rate: number
          rate_id: string
          recipient_account: string
          recipient_account_holder: string
          recipient_account_holder_document: string
          recipient_account_type: string
          recipient_amount: number
          recipient_bank: string
          recipient_bank_branch: string
          recipient_document: string
          recipient_name: string
          recipient_phone: string
          recipient_relationship: string | null
          source_country: string | null
          status: string
          to_currency: string
          transfer_note: string
          transfer_purpose: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          billing_country?: string
          billing_document?: string
          billing_document_type?: string
          billing_email?: string | null
          billing_email_verified?: boolean
          billing_name?: string
          billing_type?: string
          commission: number
          created_at?: string
          customer_document: string
          customer_document_type?: string | null
          customer_email: string
          customer_email_verified?: boolean
          customer_name: string
          customer_phone?: string
          deposit_bank_reference?: string | null
          deposit_instructions: Json
          destination_country?: string | null
          from_currency: string
          funds_declared_at?: string | null
          funds_detail?: string | null
          funds_origin?: string | null
          id?: string
          origin_bank?: string | null
          payout_at?: string | null
          payout_path?: string | null
          payout_reference?: string | null
          proof_path?: string | null
          rate: number
          rate_id: string
          recipient_account: string
          recipient_account_holder?: string
          recipient_account_holder_document?: string
          recipient_account_type?: string
          recipient_amount: number
          recipient_bank: string
          recipient_bank_branch?: string
          recipient_document: string
          recipient_name: string
          recipient_phone?: string
          recipient_relationship?: string | null
          source_country?: string | null
          status?: string
          to_currency: string
          transfer_note?: string
          transfer_purpose?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          billing_country?: string
          billing_document?: string
          billing_document_type?: string
          billing_email?: string | null
          billing_email_verified?: boolean
          billing_name?: string
          billing_type?: string
          commission?: number
          created_at?: string
          customer_document?: string
          customer_document_type?: string | null
          customer_email?: string
          customer_email_verified?: boolean
          customer_name?: string
          customer_phone?: string
          deposit_bank_reference?: string | null
          deposit_instructions?: Json
          destination_country?: string | null
          from_currency?: string
          funds_declared_at?: string | null
          funds_detail?: string | null
          funds_origin?: string | null
          id?: string
          origin_bank?: string | null
          payout_at?: string | null
          payout_path?: string | null
          payout_reference?: string | null
          proof_path?: string | null
          rate?: number
          rate_id?: string
          recipient_account?: string
          recipient_account_holder?: string
          recipient_account_holder_document?: string
          recipient_account_type?: string
          recipient_amount?: number
          recipient_bank?: string
          recipient_bank_branch?: string
          recipient_document?: string
          recipient_name?: string
          recipient_phone?: string
          recipient_relationship?: string | null
          source_country?: string | null
          status?: string
          to_currency?: string
          transfer_note?: string
          transfer_purpose?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfers_rate_id_fkey"
            columns: ["rate_id"]
            isOneToOne: false
            referencedRelation: "fx_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_channels: {
        Row: {
          ai_calls: number
          ai_window: string
          history: Json
          last_inbound: string | null
          mode: string
          phone: string
          updated_at: string
        }
        Insert: {
          ai_calls?: number
          ai_window?: string
          history?: Json
          last_inbound?: string | null
          mode?: string
          phone: string
          updated_at?: string
        }
        Update: {
          ai_calls?: number
          ai_window?: string
          history?: Json
          last_inbound?: string | null
          mode?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_events: {
        Row: {
          created_at: string
          error_code: string | null
          id: string
          payload: Json
          phone: string
          status: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          id: string
          payload: Json
          phone: string
          status?: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          id?: string
          payload?: Json
          phone?: string
          status?: string
        }
        Relationships: []
      }
      whatsapp_flow_states: {
        Row: {
          auth_cipher: string | null
          completed_at: string | null
          data: Json
          processing_id: string | null
          processing_until: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          auth_cipher?: string | null
          completed_at?: string | null
          data?: Json
          processing_id?: string | null
          processing_until?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          auth_cipher?: string | null
          completed_at?: string | null
          data?: Json
          processing_id?: string | null
          processing_until?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_flow_states_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sessions: {
        Row: {
          claimed_by: string | null
          created_at: string
          entry_mode: string
          expires_at: string
          id: string
          notification_state: string
          phone: string
          transfer_id: string | null
        }
        Insert: {
          claimed_by?: string | null
          created_at?: string
          entry_mode?: string
          expires_at?: string
          id?: string
          notification_state?: string
          phone: string
          transfer_id?: string | null
        }
        Update: {
          claimed_by?: string | null
          created_at?: string
          entry_mode?: string
          expires_at?: string
          id?: string
          notification_state?: string
          phone?: string
          transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sessions_phone_fkey"
            columns: ["phone"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["phone"]
          },
          {
            foreignKeyName: "whatsapp_sessions_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: true
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_transfer: {
        Args: {
          p_expected_status: string
          p_note: string
          p_transfer_id: string
        }
        Returns: undefined
      }
      claim_beta_invoice: {
        Args: never
        Returns: {
          beta_attempts: number
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          document_type: string
          email_attempted_at: string | null
          email_attempts: number
          email_checked_at: string | null
          email_error: string | null
          email_next_attempt_at: string | null
          email_processing_at: string | null
          email_provider_id: string | null
          email_recipient: string | null
          email_request_started_at: string | null
          email_sent_at: string | null
          email_status: string
          environment: string
          error: string | null
          external_id: string | null
          id: string
          issuer_country: string
          next_attempt_at: string | null
          number: string | null
          pdf_path: string | null
          processing_at: string | null
          status: string
          transfer_id: string
          xml_path: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_beta_submission: {
        Args: { p_invoice_id: string; p_prepared: Json; p_transfer_id: string }
        Returns: boolean
      }
      claim_brazil_invoice: {
        Args: never
        Returns: {
          beta_attempts: number
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          document_type: string
          email_attempted_at: string | null
          email_attempts: number
          email_checked_at: string | null
          email_error: string | null
          email_next_attempt_at: string | null
          email_processing_at: string | null
          email_provider_id: string | null
          email_recipient: string | null
          email_request_started_at: string | null
          email_sent_at: string | null
          email_status: string
          environment: string
          error: string | null
          external_id: string | null
          id: string
          issuer_country: string
          next_attempt_at: string | null
          number: string | null
          pdf_path: string | null
          processing_at: string | null
          status: string
          transfer_id: string
          xml_path: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_demo_invoice: {
        Args: { p_boleta_only?: boolean }
        Returns: {
          beta_attempts: number
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          document_type: string
          email_attempted_at: string | null
          email_attempts: number
          email_checked_at: string | null
          email_error: string | null
          email_next_attempt_at: string | null
          email_processing_at: string | null
          email_provider_id: string | null
          email_recipient: string | null
          email_request_started_at: string | null
          email_sent_at: string | null
          email_status: string
          environment: string
          error: string | null
          external_id: string | null
          id: string
          issuer_country: string
          next_attempt_at: string | null
          number: string | null
          pdf_path: string | null
          processing_at: string | null
          status: string
          transfer_id: string
          xml_path: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_invoice: {
        Args: never
        Returns: {
          beta_attempts: number
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          document_type: string
          email_attempted_at: string | null
          email_attempts: number
          email_checked_at: string | null
          email_error: string | null
          email_next_attempt_at: string | null
          email_processing_at: string | null
          email_provider_id: string | null
          email_recipient: string | null
          email_request_started_at: string | null
          email_sent_at: string | null
          email_status: string
          environment: string
          error: string | null
          external_id: string | null
          id: string
          issuer_country: string
          next_attempt_at: string | null
          number: string | null
          pdf_path: string | null
          processing_at: string | null
          status: string
          transfer_id: string
          xml_path: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_invoice_delivery: {
        Args: never
        Returns: {
          beta_attempts: number
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          document_type: string
          email_attempted_at: string | null
          email_attempts: number
          email_checked_at: string | null
          email_error: string | null
          email_next_attempt_at: string | null
          email_processing_at: string | null
          email_provider_id: string | null
          email_recipient: string | null
          email_request_started_at: string | null
          email_sent_at: string | null
          email_status: string
          environment: string
          error: string | null
          external_id: string | null
          id: string
          issuer_country: string
          next_attempt_at: string | null
          number: string | null
          pdf_path: string | null
          processing_at: string | null
          status: string
          transfer_id: string
          xml_path: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_mailersend_delivery: {
        Args: { p_environment: string }
        Returns: {
          beta_attempts: number
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          document_type: string
          email_attempted_at: string | null
          email_attempts: number
          email_checked_at: string | null
          email_error: string | null
          email_next_attempt_at: string | null
          email_processing_at: string | null
          email_provider_id: string | null
          email_recipient: string | null
          email_request_started_at: string | null
          email_sent_at: string | null
          email_status: string
          environment: string
          error: string | null
          external_id: string | null
          id: string
          issuer_country: string
          next_attempt_at: string | null
          number: string | null
          pdf_path: string | null
          processing_at: string | null
          status: string
          transfer_id: string
          xml_path: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_mailersend_status: {
        Args: never
        Returns: {
          beta_attempts: number
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          document_type: string
          email_attempted_at: string | null
          email_attempts: number
          email_checked_at: string | null
          email_error: string | null
          email_next_attempt_at: string | null
          email_processing_at: string | null
          email_provider_id: string | null
          email_recipient: string | null
          email_request_started_at: string | null
          email_sent_at: string | null
          email_status: string
          environment: string
          error: string | null
          external_id: string | null
          id: string
          issuer_country: string
          next_attempt_at: string | null
          number: string | null
          pdf_path: string | null
          processing_at: string | null
          status: string
          transfer_id: string
          xml_path: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_whatsapp_flow: {
        Args: { p_session_id: string }
        Returns: {
          auth_cipher: string | null
          completed_at: string | null
          data: Json
          processing_id: string | null
          processing_until: string | null
          session_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_flow_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_whatsapp_session: {
        Args: { p_id: string; p_user: string }
        Returns: {
          claimed_by: string | null
          created_at: string
          entry_mode: string
          expires_at: string
          id: string
          notification_state: string
          phone: string
          transfer_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_invoice_delivery: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      confirm_mailersend_status: {
        Args: {
          p_error?: string
          p_invoice_id: string
          p_message_id: string
          p_state: string
        }
        Returns: boolean
      }
      create_guest_transfer_base: {
        Args: {
          p_amount: number
          p_contact_email: string
          p_customer_document: string
          p_customer_name: string
          p_rate_id: string
          p_recipient_account: string
          p_recipient_bank: string
          p_recipient_document: string
          p_recipient_name: string
        }
        Returns: string
      }
      create_guest_transfer_details: {
        Args: {
          p_amount: number
          p_contact_email: string
          p_customer_document: string
          p_customer_name: string
          p_customer_phone: string
          p_rate_id: string
          p_recipient_account: string
          p_recipient_account_holder: string
          p_recipient_account_holder_document: string
          p_recipient_account_type: string
          p_recipient_bank: string
          p_recipient_bank_branch: string
          p_recipient_document: string
          p_recipient_name: string
          p_recipient_phone: string
          p_transfer_note: string
        }
        Returns: string
      }
      create_transfer: {
        Args: {
          p_amount: number
          p_customer_document: string
          p_customer_name: string
          p_rate_id: string
          p_recipient_account: string
          p_recipient_bank: string
          p_recipient_document: string
          p_recipient_name: string
        }
        Returns: string
      }
      create_transfer_details: {
        Args: {
          p_amount: number
          p_customer_document: string
          p_customer_name: string
          p_customer_phone: string
          p_rate_id: string
          p_recipient_account: string
          p_recipient_account_holder: string
          p_recipient_account_holder_document: string
          p_recipient_account_type: string
          p_recipient_bank: string
          p_recipient_bank_branch: string
          p_recipient_document: string
          p_recipient_name: string
          p_recipient_phone: string
          p_transfer_note: string
        }
        Returns: string
      }
      create_transfer_with_billing: {
        Args: {
          p_amount: number
          p_billing_document: string
          p_billing_document_type: string
          p_billing_email: string
          p_billing_name: string
          p_billing_type: string
          p_customer_document: string
          p_customer_name: string
          p_customer_phone: string
          p_rate_id: string
          p_recipient_account: string
          p_recipient_account_holder: string
          p_recipient_account_holder_document: string
          p_recipient_account_type: string
          p_recipient_bank: string
          p_recipient_bank_branch: string
          p_recipient_document: string
          p_recipient_name: string
          p_recipient_phone: string
          p_transfer_note: string
        }
        Returns: string
      }
      create_validated_transfer: {
        Args: {
          p_amount: number
          p_billing_document: string
          p_billing_document_type: string
          p_billing_email: string
          p_billing_name: string
          p_billing_type: string
          p_customer_document: string
          p_customer_document_type: string
          p_customer_name: string
          p_customer_phone: string
          p_declaration_accepted: boolean
          p_destination_country: string
          p_funds_detail: string
          p_funds_origin: string
          p_origin_bank: string
          p_rate_id: string
          p_recipient_account: string
          p_recipient_account_holder: string
          p_recipient_account_holder_document: string
          p_recipient_account_type: string
          p_recipient_bank: string
          p_recipient_bank_branch: string
          p_recipient_document: string
          p_recipient_name: string
          p_recipient_phone: string
          p_recipient_relationship: string
          p_source_country: string
          p_transfer_note: string
          p_transfer_purpose: string
        }
        Returns: string
      }
      create_whatsapp_native_transfer: {
        Args: {
          p_data: Json
          p_expected_commission: number
          p_expected_rate: number
          p_session_id: string
        }
        Returns: string
      }
      create_whatsapp_transfer: {
        Args: { p_data: Json; p_session_id: string }
        Returns: string
      }
      delete_saved_recipient: { Args: { p_id: string }; Returns: boolean }
      has_registered_session: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      record_beta_result: {
        Args: { p_invoice_id: string; p_result: Json }
        Returns: undefined
      }
      record_mailersend_result: {
        Args: {
          p_attempt: number
          p_delay?: number
          p_error?: string
          p_invoice_id: string
          p_message_id?: string
          p_state: string
        }
        Returns: boolean
      }
      reserve_whatsapp_ai: { Args: { p_phone: string }; Returns: boolean }
      restore_verified_transfer: {
        Args: { p_note: string; p_transfer_id: string }
        Returns: undefined
      }
      review_transfer: {
        Args: {
          p_action: string
          p_note: string
          p_payout_path?: string
          p_reference?: string
          p_transfer_id: string
        }
        Returns: undefined
      }
      save_transfer_recipient: {
        Args: { p_label: string; p_transfer_id: string }
        Returns: string
      }
      schedule_beta_retry: { Args: { p_invoice_id: string }; Returns: boolean }
      staff_dashboard_summary: { Args: never; Returns: Json }
      start_mailersend_request: {
        Args: { p_attempt: number; p_invoice_id: string; p_recipient: string }
        Returns: boolean
      }
      submit_proof: {
        Args: { p_path: string; p_transfer_id: string }
        Returns: undefined
      }
      submit_transfer_proof: {
        Args: {
          p_bank_reference: string
          p_path: string
          p_transfer_id: string
        }
        Returns: undefined
      }
      verify_transfer_contact: { Args: never; Returns: undefined }
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
