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
          currency: string
          holder: string
          id: string
          instructions: string
        }
        Insert: {
          account_number: string
          active?: boolean
          bank: string
          currency: string
          holder: string
          id?: string
          instructions?: string
        }
        Update: {
          account_number?: string
          active?: boolean
          bank?: string
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
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          email_attempted_at: string | null
          environment: string
          error: string | null
          external_id: string | null
          id: string
          number: string | null
          pdf_path: string | null
          status: string
          transfer_id: string
          xml_path: string | null
        }
        Insert: {
          beta_prepared?: Json | null
          beta_result?: Json | null
          beta_sent_at?: string | null
          cdr_path?: string | null
          created_at?: string
          delivered_at?: string | null
          email_attempted_at?: string | null
          environment?: string
          error?: string | null
          external_id?: string | null
          id?: string
          number?: string | null
          pdf_path?: string | null
          status?: string
          transfer_id: string
          xml_path?: string | null
        }
        Update: {
          beta_prepared?: Json | null
          beta_result?: Json | null
          beta_sent_at?: string | null
          cdr_path?: string | null
          created_at?: string
          delivered_at?: string | null
          email_attempted_at?: string | null
          environment?: string
          error?: string | null
          external_id?: string | null
          id?: string
          number?: string | null
          pdf_path?: string | null
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
          commission: number
          created_at: string
          customer_document: string
          customer_email: string
          customer_email_verified: boolean
          customer_name: string
          customer_phone: string
          deposit_instructions: Json
          from_currency: string
          id: string
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
          status: string
          to_currency: string
          transfer_note: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          commission: number
          created_at?: string
          customer_document: string
          customer_email: string
          customer_email_verified?: boolean
          customer_name: string
          customer_phone?: string
          deposit_instructions: Json
          from_currency: string
          id?: string
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
          status?: string
          to_currency: string
          transfer_note?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          commission?: number
          created_at?: string
          customer_document?: string
          customer_email?: string
          customer_email_verified?: boolean
          customer_name?: string
          customer_phone?: string
          deposit_instructions?: Json
          from_currency?: string
          id?: string
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
          status?: string
          to_currency?: string
          transfer_note?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_beta_invoice: {
        Args: never
        Returns: {
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          email_attempted_at: string | null
          environment: string
          error: string | null
          external_id: string | null
          id: string
          number: string | null
          pdf_path: string | null
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
      claim_invoice: {
        Args: never
        Returns: {
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          email_attempted_at: string | null
          environment: string
          error: string | null
          external_id: string | null
          id: string
          number: string | null
          pdf_path: string | null
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
          beta_prepared: Json | null
          beta_result: Json | null
          beta_sent_at: string | null
          cdr_path: string | null
          created_at: string
          delivered_at: string | null
          email_attempted_at: string | null
          environment: string
          error: string | null
          external_id: string | null
          id: string
          number: string | null
          pdf_path: string | null
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
      complete_invoice_delivery: {
        Args: { p_invoice_id: string }
        Returns: undefined
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
      is_staff: { Args: never; Returns: boolean }
      record_beta_result: {
        Args: { p_invoice_id: string; p_result: Json }
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
      staff_dashboard_summary: { Args: never; Returns: Json }
      submit_proof: {
        Args: { p_path: string; p_transfer_id: string }
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
