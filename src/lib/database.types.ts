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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_plan_items: {
        Row: {
          created_at: string
          created_by: string | null
          done: boolean
          id: string
          is_archived: boolean
          is_stats_visible: boolean
          outer_id: string | null
          owner_id: string
          period_id: string | null
          position_id: string | null
          sort: number
          statistic_id: string | null
          target: string | null
          text: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          id?: string
          is_archived?: boolean
          is_stats_visible?: boolean
          outer_id?: string | null
          owner_id?: string
          period_id?: string | null
          position_id?: string | null
          sort?: number
          statistic_id?: string | null
          target?: string | null
          text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          id?: string
          is_archived?: boolean
          is_stats_visible?: boolean
          outer_id?: string | null
          owner_id?: string
          period_id?: string | null
          position_id?: string | null
          sort?: number
          statistic_id?: string | null
          target?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_plan_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_plan_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_plan_items_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_plan_items_statistic_id_fkey"
            columns: ["statistic_id"]
            isOneToOne: false
            referencedRelation: "statistics"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_attachments: {
        Row: {
          bill_id: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          uploaded_by: string
        }
        Insert: {
          bill_id: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          uploaded_by: string
        }
        Update: {
          bill_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_attachments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          invoice_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          invoice_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          invoice_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_attachments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "client_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_account_folders: {
        Row: {
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_account_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cash_account_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_accounts: {
        Row: {
          balance: number
          currency_id: string
          folder_id: string | null
          id: string
          is_archived: boolean
          location_id: string | null
          name: string
          outer_id: string | null
          type: Database["public"]["Enums"]["cash_account_type"]
        }
        Insert: {
          balance?: number
          currency_id: string
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name: string
          outer_id?: string | null
          type: Database["public"]["Enums"]["cash_account_type"]
        }
        Update: {
          balance?: number
          currency_id?: string
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name?: string
          outer_id?: string | null
          type?: Database["public"]["Enums"]["cash_account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_accounts_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_accounts_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "cash_account_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_accounts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invoices: {
        Row: {
          amount: number
          comment: string | null
          counterparty_id: string
          created_at: string
          created_by: string
          currency_id: string
          event_name: string
          event_on: string | null
          hall: string | null
          id: string
          income_type_id: string
          is_archived: boolean
          location_id: string
          number: number
          outer_id: string | null
          status: Database["public"]["Enums"]["client_invoice_status"]
        }
        Insert: {
          amount: number
          comment?: string | null
          counterparty_id: string
          created_at?: string
          created_by: string
          currency_id: string
          event_name: string
          event_on?: string | null
          hall?: string | null
          id?: string
          income_type_id: string
          is_archived?: boolean
          location_id: string
          number?: never
          outer_id?: string | null
          status?: Database["public"]["Enums"]["client_invoice_status"]
        }
        Update: {
          amount?: number
          comment?: string | null
          counterparty_id?: string
          created_at?: string
          created_by?: string
          currency_id?: string
          event_name?: string
          event_on?: string | null
          hall?: string | null
          id?: string
          income_type_id?: string
          is_archived?: boolean
          location_id?: string
          number?: never
          outer_id?: string | null
          status?: Database["public"]["Enums"]["client_invoice_status"]
        }
        Relationships: [
          {
            foreignKeyName: "client_invoices_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoices_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoices_income_type_id_fkey"
            columns: ["income_type_id"]
            isOneToOne: false
            referencedRelation: "income_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparties: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_mfo: string | null
          bank_name: string | null
          category_id: string | null
          comment: string | null
          contact_person: string | null
          created_at: string
          entity_type: string | null
          id: string
          inn: string | null
          is_archived: boolean
          is_client: boolean
          is_supplier: boolean
          name: string
          outer_id: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_mfo?: string | null
          bank_name?: string | null
          category_id?: string | null
          comment?: string | null
          contact_person?: string | null
          created_at?: string
          entity_type?: string | null
          id?: string
          inn?: string | null
          is_archived?: boolean
          is_client?: boolean
          is_supplier?: boolean
          name: string
          outer_id?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_mfo?: string | null
          bank_name?: string | null
          category_id?: string | null
          comment?: string | null
          contact_person?: string | null
          created_at?: string
          entity_type?: string | null
          id?: string
          inn?: string | null
          is_archived?: boolean
          is_client?: boolean
          is_supplier?: boolean
          name?: string
          outer_id?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counterparties_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "counterparty_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparty_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_archived: boolean
          name: string
          outer_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          name: string
          outer_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          name?: string
          outer_id?: string | null
        }
        Relationships: []
      }
      counterparty_contacts: {
        Row: {
          counterparty_id: string
          created_at: string
          id: string
          is_primary: boolean
          kind: string
          label: string | null
          value: string
        }
        Insert: {
          counterparty_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          label?: string | null
          value: string
        }
        Update: {
          counterparty_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          label?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "counterparty_contacts_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_clients: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_archived: boolean
          location_id: string | null
          name: string
          note: string | null
          outer_id: string | null
          phone: string | null
          tag: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name: string
          note?: string | null
          outer_id?: string | null
          phone?: string | null
          tag?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name?: string
          note?: string | null
          outer_id?: string | null
          phone?: string | null
          tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_clients_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_halls: {
        Row: {
          capacity: number | null
          created_at: string
          created_by: string | null
          id: string
          is_archived: boolean
          location_id: string | null
          name: string
          outer_id: string | null
          sort: number
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name: string
          outer_id?: string | null
          sort?: number
        }
        Update: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name?: string
          outer_id?: string | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_halls_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_checklist: {
        Row: {
          created_at: string
          done: boolean
          id: string
          lead_id: string
          sort: number
          text: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          lead_id: string
          sort?: number
          text: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          lead_id?: string
          sort?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_checklist_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          budget: number
          client_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          event_date: string | null
          event_type: string | null
          guests: number
          hall_id: string | null
          id: string
          is_archived: boolean
          location_id: string | null
          name: string
          note: string | null
          outer_id: string | null
          phone: string | null
          responsible_id: string | null
          sort: number
          source: string | null
          stage: Database["public"]["Enums"]["crm_lead_stage"]
          stage_id: string | null
        }
        Insert: {
          budget?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          event_date?: string | null
          event_type?: string | null
          guests?: number
          hall_id?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name: string
          note?: string | null
          outer_id?: string | null
          phone?: string | null
          responsible_id?: string | null
          sort?: number
          source?: string | null
          stage?: Database["public"]["Enums"]["crm_lead_stage"]
          stage_id?: string | null
        }
        Update: {
          budget?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          event_date?: string | null
          event_type?: string | null
          guests?: number
          hall_id?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name?: string
          note?: string | null
          outer_id?: string | null
          phone?: string | null
          responsible_id?: string | null
          sort?: number
          source?: string | null
          stage?: Database["public"]["Enums"]["crm_lead_stage"]
          stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_hall_id_fkey"
            columns: ["hall_id"]
            isOneToOne: false
            referencedRelation: "crm_halls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_stages: {
        Row: {
          code: string | null
          color: string | null
          created_at: string
          id: string
          is_archived: boolean
          is_lost: boolean
          is_won: boolean
          location_id: string | null
          name: string
          sort: number
        }
        Insert: {
          code?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          is_lost?: boolean
          is_won?: boolean
          location_id?: string | null
          name: string
          sort?: number
        }
        Update: {
          code?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          is_lost?: boolean
          is_won?: boolean
          location_id?: string | null
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_stages_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          id: string
          is_base: boolean
          name: string
        }
        Insert: {
          code: string
          id?: string
          is_base?: boolean
          name: string
        }
        Update: {
          code?: string
          id?: string
          is_base?: boolean
          name?: string
        }
        Relationships: []
      }
      directives: {
        Row: {
          conducted_at: string
          conducted_by: string
          id: string
          period_id: string
          protocol: Json | null
          total_income: number
        }
        Insert: {
          conducted_at?: string
          conducted_by: string
          id?: string
          period_id: string
          protocol?: Json | null
          total_income?: number
        }
        Update: {
          conducted_at?: string
          conducted_by?: string
          id?: string
          period_id?: string
          protocol?: Json | null
          total_income?: number
        }
        Relationships: [
          {
            foreignKeyName: "directives_conducted_by_fkey"
            columns: ["conducted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directives_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: true
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_rules: {
        Row: {
          fixed_amount: number | null
          fund_id: string
          id: string
          income_type_id: string | null
          is_archived: boolean
          percent: number | null
          priority: number
          stage: Database["public"]["Enums"]["distribution_stage"]
        }
        Insert: {
          fixed_amount?: number | null
          fund_id: string
          id?: string
          income_type_id?: string | null
          is_archived?: boolean
          percent?: number | null
          priority?: number
          stage: Database["public"]["Enums"]["distribution_stage"]
        }
        Update: {
          fixed_amount?: number | null
          fund_id?: string
          id?: string
          income_type_id?: string | null
          is_archived?: boolean
          percent?: number | null
          priority?: number
          stage?: Database["public"]["Enums"]["distribution_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "distribution_rules_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_rules_income_type_id_fkey"
            columns: ["income_type_id"]
            isOneToOne: false
            referencedRelation: "income_types"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_by: string | null
          from_cur_id: string
          id: string
          rate: number
          to_cur_id: string
          valid_from: string
        }
        Insert: {
          created_by?: string | null
          from_cur_id: string
          id?: string
          rate: number
          to_cur_id: string
          valid_from: string
        }
        Update: {
          created_by?: string | null
          from_cur_id?: string
          id?: string
          rate?: number
          to_cur_id?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_rates_from_cur_id_fkey"
            columns: ["from_cur_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_rates_to_cur_id_fkey"
            columns: ["to_cur_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_type_access: {
        Row: {
          expense_type_id: string
          user_id: string
        }
        Insert: {
          expense_type_id: string
          user_id: string
        }
        Update: {
          expense_type_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_type_access_expense_type_id_fkey"
            columns: ["expense_type_id"]
            isOneToOne: false
            referencedRelation: "expense_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_type_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_types: {
        Row: {
          code: string | null
          default_fund_id: string | null
          default_purpose: string | null
          id: string
          is_archived: boolean
          location_id: string | null
          name: string
          outer_id: string | null
          parent_id: string | null
        }
        Insert: {
          code?: string | null
          default_fund_id?: string | null
          default_purpose?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name: string
          outer_id?: string | null
          parent_id?: string | null
        }
        Update: {
          code?: string | null
          default_fund_id?: string | null
          default_purpose?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name?: string
          outer_id?: string | null
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_types_default_fund_id_fkey"
            columns: ["default_fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_types_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_types_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "expense_types"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_periods: {
        Row: {
          baf_confirmed_at: string | null
          baf_confirmed_by: string | null
          closed_at: string | null
          closed_by: string | null
          ends_on: string
          executive_confirmed_at: string | null
          executive_confirmed_by: string | null
          id: string
          is_baf_confirmed: boolean
          is_executive_confirmed: boolean
          starts_on: string
          status: Database["public"]["Enums"]["period_status"]
        }
        Insert: {
          baf_confirmed_at?: string | null
          baf_confirmed_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          ends_on: string
          executive_confirmed_at?: string | null
          executive_confirmed_by?: string | null
          id?: string
          is_baf_confirmed?: boolean
          is_executive_confirmed?: boolean
          starts_on: string
          status?: Database["public"]["Enums"]["period_status"]
        }
        Update: {
          baf_confirmed_at?: string | null
          baf_confirmed_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          ends_on?: string
          executive_confirmed_at?: string | null
          executive_confirmed_by?: string | null
          id?: string
          is_baf_confirmed?: boolean
          is_executive_confirmed?: boolean
          starts_on?: string
          status?: Database["public"]["Enums"]["period_status"]
        }
        Relationships: [
          {
            foreignKeyName: "fp_periods_baf_confirmed_by_fkey"
            columns: ["baf_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_periods_executive_confirmed_by_fkey"
            columns: ["executive_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_register: {
        Row: {
          bill_id: string | null
          cash_account_id: string | null
          cash_amount: number | null
          comment: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string
          currency_id: string | null
          fund_amount: number | null
          fund_id: string | null
          fx_rate: number | null
          id: number
          income_id: string | null
          loan_parent_id: number | null
          op_type: Database["public"]["Enums"]["register_op_type"]
          pair_id: string | null
          payment_type_id: string | null
          payroll_sheet_id: string | null
          period_id: string | null
          request_id: string | null
          reverses_id: number | null
        }
        Insert: {
          bill_id?: string | null
          cash_account_id?: string | null
          cash_amount?: number | null
          comment?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by: string
          currency_id?: string | null
          fund_amount?: number | null
          fund_id?: string | null
          fx_rate?: number | null
          id?: never
          income_id?: string | null
          loan_parent_id?: number | null
          op_type: Database["public"]["Enums"]["register_op_type"]
          pair_id?: string | null
          payment_type_id?: string | null
          payroll_sheet_id?: string | null
          period_id?: string | null
          request_id?: string | null
          reverses_id?: number | null
        }
        Update: {
          bill_id?: string | null
          cash_account_id?: string | null
          cash_amount?: number | null
          comment?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string
          currency_id?: string | null
          fund_amount?: number | null
          fund_id?: string | null
          fx_rate?: number | null
          id?: never
          income_id?: string | null
          loan_parent_id?: number | null
          op_type?: Database["public"]["Enums"]["register_op_type"]
          pair_id?: string | null
          payment_type_id?: string | null
          payroll_sheet_id?: string | null
          period_id?: string | null
          request_id?: string | null
          reverses_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fp_register_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_income_id_fkey"
            columns: ["income_id"]
            isOneToOne: false
            referencedRelation: "incomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_loan_parent_id_fkey"
            columns: ["loan_parent_id"]
            isOneToOne: false
            referencedRelation: "fp_register"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_payment_type_id_fkey"
            columns: ["payment_type_id"]
            isOneToOne: false
            referencedRelation: "payment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_payroll_sheet_id_fkey"
            columns: ["payroll_sheet_id"]
            isOneToOne: false
            referencedRelation: "payroll_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_register_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "fp_register"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_access: {
        Row: {
          fund_id: string
          user_id: string
        }
        Insert: {
          fund_id: string
          user_id: string
        }
        Update: {
          fund_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_access_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_folders: {
        Row: {
          color: string | null
          description: string | null
          id: string
          is_archived: boolean
          name: string
          parent_id: string | null
        }
        Insert: {
          color?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name: string
          parent_id?: string | null
        }
        Update: {
          color?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "fund_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          balance: number
          code: string
          color: string | null
          created_at: string
          currency_id: string
          description: string | null
          folder_id: string | null
          id: string
          is_archived: boolean
          is_private: boolean
          is_restricted: boolean
          kind: Database["public"]["Enums"]["fund_kind"]
          location_id: string | null
          name: string
          no_transfer: boolean
          outer_id: string | null
          stage: Database["public"]["Enums"]["distribution_stage"] | null
        }
        Insert: {
          balance?: number
          code: string
          color?: string | null
          created_at?: string
          currency_id: string
          description?: string | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          is_private?: boolean
          is_restricted?: boolean
          kind?: Database["public"]["Enums"]["fund_kind"]
          location_id?: string | null
          name: string
          no_transfer?: boolean
          outer_id?: string | null
          stage?: Database["public"]["Enums"]["distribution_stage"] | null
        }
        Update: {
          balance?: number
          code?: string
          color?: string | null
          created_at?: string
          currency_id?: string
          description?: string | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          is_private?: boolean
          is_restricted?: boolean
          kind?: Database["public"]["Enums"]["fund_kind"]
          location_id?: string | null
          name?: string
          no_transfer?: boolean
          outer_id?: string | null
          stage?: Database["public"]["Enums"]["distribution_stage"] | null
        }
        Relationships: [
          {
            foreignKeyName: "funds_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "fund_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      income_types: {
        Row: {
          code: string | null
          id: string
          is_archived: boolean
          location_id: string | null
          name: string
          outer_id: string | null
          parent_id: string | null
        }
        Insert: {
          code?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name: string
          outer_id?: string | null
          parent_id?: string | null
        }
        Update: {
          code?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          name?: string
          outer_id?: string | null
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "income_types_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_types_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "income_types"
            referencedColumns: ["id"]
          },
        ]
      }
      incomes: {
        Row: {
          amount: number
          amount_base: number
          basis_document: string | null
          cash_account_id: string
          comment: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string
          currency_id: string
          id: string
          income_type_id: string
          invoice_id: string | null
          is_distributed: boolean
          is_return: boolean
          location_id: string
          outer_id: string | null
          payment_type_id: string
          period_id: string
          received_on: string
          reverses_income_id: string | null
          source: string
        }
        Insert: {
          amount: number
          amount_base: number
          basis_document?: string | null
          cash_account_id: string
          comment?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by: string
          currency_id: string
          id?: string
          income_type_id: string
          invoice_id?: string | null
          is_distributed?: boolean
          is_return?: boolean
          location_id: string
          outer_id?: string | null
          payment_type_id: string
          period_id: string
          received_on: string
          reverses_income_id?: string | null
          source?: string
        }
        Update: {
          amount?: number
          amount_base?: number
          basis_document?: string | null
          cash_account_id?: string
          comment?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string
          currency_id?: string
          id?: string
          income_type_id?: string
          invoice_id?: string | null
          is_distributed?: boolean
          is_return?: boolean
          location_id?: string
          outer_id?: string | null
          payment_type_id?: string
          period_id?: string
          received_on?: string
          reverses_income_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "incomes_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_income_type_id_fkey"
            columns: ["income_type_id"]
            isOneToOne: false
            referencedRelation: "income_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "client_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_payment_type_id_fkey"
            columns: ["payment_type_id"]
            isOneToOne: false
            referencedRelation: "payment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_reverses_income_id_fkey"
            columns: ["reverses_income_id"]
            isOneToOne: false
            referencedRelation: "incomes"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_by: string
          expires_at: string
          id: string
          location_id: string | null
          position_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_by: string
          expires_at?: string
          id?: string
          location_id?: string | null
          position_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_by?: string
          expires_at?: string
          id?: string
          location_id?: string | null
          position_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          city: string
          created_at: string
          id: string
          is_archived: boolean
          manager_id: string | null
          name: string
          outer_id: string | null
          status: Database["public"]["Enums"]["location_status"]
          type: Database["public"]["Enums"]["location_type"]
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          is_archived?: boolean
          manager_id?: string | null
          name: string
          outer_id?: string | null
          status?: Database["public"]["Enums"]["location_status"]
          type: Database["public"]["Enums"]["location_type"]
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          is_archived?: boolean
          manager_id?: string | null
          name?: string
          outer_id?: string | null
          status?: Database["public"]["Enums"]["location_status"]
          type?: Database["public"]["Enums"]["location_type"]
        }
        Relationships: [
          {
            foreignKeyName: "locations_manager_fk"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mj_bills: {
        Row: {
          company_name: string | null
          data: Json
          doc_date: string | null
          expense_name: string | null
          id: number
          marked_payed: boolean | null
          mj_id: number
          number: string | null
          payed_amount: number | null
          planned_date: string | null
          remaining_amount: number | null
          seria: string | null
          synced_at: string
          total_amount: number | null
        }
        Insert: {
          company_name?: string | null
          data: Json
          doc_date?: string | null
          expense_name?: string | null
          id?: never
          marked_payed?: boolean | null
          mj_id: number
          number?: string | null
          payed_amount?: number | null
          planned_date?: string | null
          remaining_amount?: number | null
          seria?: string | null
          synced_at?: string
          total_amount?: number | null
        }
        Update: {
          company_name?: string | null
          data?: Json
          doc_date?: string | null
          expense_name?: string | null
          id?: never
          marked_payed?: boolean | null
          mj_id?: number
          number?: string | null
          payed_amount?: number | null
          planned_date?: string | null
          remaining_amount?: number | null
          seria?: string | null
          synced_at?: string
          total_amount?: number | null
        }
        Relationships: []
      }
      mj_companies: {
        Row: {
          data: Json
          id: number
          is_customer: boolean | null
          is_private_person: boolean | null
          is_vendor: boolean | null
          mj_id: number
          name: string | null
          synced_at: string
        }
        Insert: {
          data: Json
          id?: never
          is_customer?: boolean | null
          is_private_person?: boolean | null
          is_vendor?: boolean | null
          mj_id: number
          name?: string | null
          synced_at?: string
        }
        Update: {
          data?: Json
          id?: never
          is_customer?: boolean | null
          is_private_person?: boolean | null
          is_vendor?: boolean | null
          mj_id?: number
          name?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      mj_funds: {
        Row: {
          data: Json
          id: number
          in_archive: boolean | null
          mj_id: number
          name: string | null
          number: string | null
          synced_at: string
        }
        Insert: {
          data: Json
          id?: never
          in_archive?: boolean | null
          mj_id: number
          name?: string | null
          number?: string | null
          synced_at?: string
        }
        Update: {
          data?: Json
          id?: never
          in_archive?: boolean | null
          mj_id?: number
          name?: string | null
          number?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      mj_incomes: {
        Row: {
          amount: number | null
          company_name: string | null
          data: Json
          date_operation: string | null
          id: number
          income_type_name: string | null
          mj_id: number
          payment_type_name: string | null
          period_mj_id: number | null
          synced_at: string
        }
        Insert: {
          amount?: number | null
          company_name?: string | null
          data: Json
          date_operation?: string | null
          id?: never
          income_type_name?: string | null
          mj_id: number
          payment_type_name?: string | null
          period_mj_id?: number | null
          synced_at?: string
        }
        Update: {
          amount?: number | null
          company_name?: string | null
          data?: Json
          date_operation?: string | null
          id?: never
          income_type_name?: string | null
          mj_id?: number
          payment_type_name?: string | null
          period_mj_id?: number | null
          synced_at?: string
        }
        Relationships: []
      }
      mj_invoices: {
        Row: {
          company_name: string | null
          data: Json
          doc_date: string | null
          id: number
          mj_id: number
          number: string | null
          payed_amount: number | null
          remaining_amount: number | null
          seria: string | null
          synced_at: string
          total_amount: number | null
        }
        Insert: {
          company_name?: string | null
          data: Json
          doc_date?: string | null
          id?: never
          mj_id: number
          number?: string | null
          payed_amount?: number | null
          remaining_amount?: number | null
          seria?: string | null
          synced_at?: string
          total_amount?: number | null
        }
        Update: {
          company_name?: string | null
          data?: Json
          doc_date?: string | null
          id?: never
          mj_id?: number
          number?: string | null
          payed_amount?: number | null
          remaining_amount?: number | null
          seria?: string | null
          synced_at?: string
          total_amount?: number | null
        }
        Relationships: []
      }
      mj_periods: {
        Row: {
          data: Json
          date_from: string | null
          date_to: string | null
          id: number
          is_baf_confirmed: boolean | null
          is_executive_confirmed: boolean | null
          mj_id: number
          synced_at: string
        }
        Insert: {
          data: Json
          date_from?: string | null
          date_to?: string | null
          id?: never
          is_baf_confirmed?: boolean | null
          is_executive_confirmed?: boolean | null
          mj_id: number
          synced_at?: string
        }
        Update: {
          data?: Json
          date_from?: string | null
          date_to?: string | null
          id?: never
          is_baf_confirmed?: boolean | null
          is_executive_confirmed?: boolean | null
          mj_id?: number
          synced_at?: string
        }
        Relationships: []
      }
      mj_persons: {
        Row: {
          data: Json
          first_name: string | null
          id: number
          is_disabled: boolean | null
          last_name: string | null
          mj_id: number
          name: string | null
          synced_at: string
        }
        Insert: {
          data: Json
          first_name?: string | null
          id?: never
          is_disabled?: boolean | null
          last_name?: string | null
          mj_id: number
          name?: string | null
          synced_at?: string
        }
        Update: {
          data?: Json
          first_name?: string | null
          id?: never
          is_disabled?: boolean | null
          last_name?: string | null
          mj_id?: number
          name?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      mj_positions: {
        Row: {
          data: Json
          full_number: string | null
          functional: string | null
          id: number
          in_archive: boolean | null
          mj_id: number
          name: string | null
          person_name: string | null
          synced_at: string
        }
        Insert: {
          data: Json
          full_number?: string | null
          functional?: string | null
          id?: never
          in_archive?: boolean | null
          mj_id: number
          name?: string | null
          person_name?: string | null
          synced_at?: string
        }
        Update: {
          data?: Json
          full_number?: string | null
          functional?: string | null
          id?: never
          in_archive?: boolean | null
          mj_id?: number
          name?: string | null
          person_name?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      mj_purchase_orders: {
        Row: {
          confirmed_value: number | null
          csw_data: string | null
          csw_situation: string | null
          csw_solution: string | null
          data: Json
          expense_name: string | null
          fund_name: string | null
          id: number
          mj_id: number
          name: string | null
          payed_amount: number | null
          planned_value: number | null
          position_name: string | null
          status: number | null
          synced_at: string
        }
        Insert: {
          confirmed_value?: number | null
          csw_data?: string | null
          csw_situation?: string | null
          csw_solution?: string | null
          data: Json
          expense_name?: string | null
          fund_name?: string | null
          id?: never
          mj_id: number
          name?: string | null
          payed_amount?: number | null
          planned_value?: number | null
          position_name?: string | null
          status?: number | null
          synced_at?: string
        }
        Update: {
          confirmed_value?: number | null
          csw_data?: string | null
          csw_situation?: string | null
          csw_solution?: string | null
          data?: Json
          expense_name?: string | null
          fund_name?: string | null
          id?: never
          mj_id?: number
          name?: string | null
          payed_amount?: number | null
          planned_value?: number | null
          position_name?: string | null
          status?: number | null
          synced_at?: string
        }
        Relationships: []
      }
      mj_stat_values: {
        Row: {
          amount: number | null
          data: Json
          description: string | null
          id: number
          is_quota: boolean
          period_begin: string
          period_end: string
          stat_mj_id: number
          synced_at: string
        }
        Insert: {
          amount?: number | null
          data: Json
          description?: string | null
          id?: never
          is_quota?: boolean
          period_begin: string
          period_end: string
          stat_mj_id: number
          synced_at?: string
        }
        Update: {
          amount?: number | null
          data?: Json
          description?: string | null
          id?: never
          is_quota?: boolean
          period_begin?: string
          period_end?: string
          stat_mj_id?: number
          synced_at?: string
        }
        Relationships: []
      }
      mj_stats: {
        Row: {
          data: Json
          id: number
          max_val: number | null
          min_val: number | null
          mj_id: number
          name: string | null
          period: number | null
          position_name: string | null
          sign: boolean | null
          stat_type: number | null
          synced_at: string
          unit: string | null
        }
        Insert: {
          data: Json
          id?: never
          max_val?: number | null
          min_val?: number | null
          mj_id: number
          name?: string | null
          period?: number | null
          position_name?: string | null
          sign?: boolean | null
          stat_type?: number | null
          synced_at?: string
          unit?: string | null
        }
        Update: {
          data?: Json
          id?: never
          max_val?: number | null
          min_val?: number | null
          mj_id?: number
          name?: string | null
          period?: number | null
          position_name?: string | null
          sign?: boolean | null
          stat_type?: number | null
          synced_at?: string
          unit?: string | null
        }
        Relationships: []
      }
      mj_sync_log: {
        Row: {
          entities: Json | null
          error: string | null
          finished_at: string | null
          id: number
          ok: boolean | null
          started_at: string
          trigger: string | null
        }
        Insert: {
          entities?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: never
          ok?: boolean | null
          started_at?: string
          trigger?: string | null
        }
        Update: {
          entities?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: never
          ok?: boolean | null
          started_at?: string
          trigger?: string | null
        }
        Relationships: []
      }
      org_divisions: {
        Row: {
          ckp: string | null
          code: string
          color: string | null
          id: string
          name: string
          sort: number
        }
        Insert: {
          ckp?: string | null
          code: string
          color?: string | null
          id?: string
          name: string
          sort?: number
        }
        Update: {
          ckp?: string | null
          code?: string
          color?: string | null
          id?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
      org_positions: {
        Row: {
          ckp: string | null
          code: string
          division_id: string | null
          duties: Json
          id: string
          is_archived: boolean
          is_executive: boolean
          location_id: string | null
          name: string
          outer_id: string | null
          parent_id: string | null
          section: string | null
          sort: number
          statistic: string | null
        }
        Insert: {
          ckp?: string | null
          code: string
          division_id?: string | null
          duties?: Json
          id?: string
          is_archived?: boolean
          is_executive?: boolean
          location_id?: string | null
          name: string
          outer_id?: string | null
          parent_id?: string | null
          section?: string | null
          sort?: number
          statistic?: string | null
        }
        Update: {
          ckp?: string | null
          code?: string
          division_id?: string | null
          duties?: Json
          id?: string
          is_archived?: boolean
          is_executive?: boolean
          location_id?: string | null
          name?: string
          outer_id?: string | null
          parent_id?: string | null
          section?: string | null
          sort?: number
          statistic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_positions_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "org_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_positions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_positions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          kind: string
          module: string | null
          request_id: string | null
          title: string
          user_id: string
          view_key: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind: string
          module?: string | null
          request_id?: string | null
          title: string
          user_id: string
          view_key?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          module?: string | null
          request_id?: string | null
          title?: string
          user_id?: string
          view_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          approved_amount: number | null
          comment: string | null
          counterparty_id: string | null
          created_at: string
          csw_data: string
          csw_situation: string
          csw_solution: string
          currency_id: string
          decided_at: string | null
          decided_by: string | null
          expense_type_id: string
          fund_id: string | null
          id: string
          location_id: string
          number: number
          outer_id: string | null
          paid_amount: number
          payment_type_id: string | null
          period_id: string | null
          period_paid_id: string | null
          planned_amount: number
          position_id: string
          purpose: string | null
          rejection_reason: string | null
          requester_id: string
          status: Database["public"]["Enums"]["request_status"]
          tags: string[]
        }
        Insert: {
          approved_amount?: number | null
          comment?: string | null
          counterparty_id?: string | null
          created_at?: string
          csw_data: string
          csw_situation: string
          csw_solution: string
          currency_id: string
          decided_at?: string | null
          decided_by?: string | null
          expense_type_id: string
          fund_id?: string | null
          id?: string
          location_id: string
          number?: never
          outer_id?: string | null
          paid_amount?: number
          payment_type_id?: string | null
          period_id?: string | null
          period_paid_id?: string | null
          planned_amount: number
          position_id: string
          purpose?: string | null
          rejection_reason?: string | null
          requester_id: string
          status?: Database["public"]["Enums"]["request_status"]
          tags?: string[]
        }
        Update: {
          approved_amount?: number | null
          comment?: string | null
          counterparty_id?: string | null
          created_at?: string
          csw_data?: string
          csw_situation?: string
          csw_solution?: string
          currency_id?: string
          decided_at?: string | null
          decided_by?: string | null
          expense_type_id?: string
          fund_id?: string | null
          id?: string
          location_id?: string
          number?: never
          outer_id?: string | null
          paid_amount?: number
          payment_type_id?: string | null
          period_id?: string | null
          period_paid_id?: string | null
          planned_amount?: number
          position_id?: string
          purpose?: string | null
          rejection_reason?: string | null
          requester_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_expense_type_id_fkey"
            columns: ["expense_type_id"]
            isOneToOne: false
            referencedRelation: "expense_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_payment_type_id_fkey"
            columns: ["payment_type_id"]
            isOneToOne: false
            referencedRelation: "payment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_period_paid_id_fkey"
            columns: ["period_paid_id"]
            isOneToOne: false
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_types: {
        Row: {
          id: string
          is_archived: boolean
          name: string
          outer_id: string | null
        }
        Insert: {
          id?: string
          is_archived?: boolean
          name: string
          outer_id?: string | null
        }
        Update: {
          id?: string
          is_archived?: boolean
          name?: string
          outer_id?: string | null
        }
        Relationships: []
      }
      payroll_lines: {
        Row: {
          accrued: number
          advance: number
          coefficient: number
          deduction: number
          id: string
          person_id: string
          points: number
          sheet_id: string
          state: Database["public"]["Enums"]["hms_state"]
        }
        Insert: {
          accrued?: number
          advance?: number
          coefficient?: number
          deduction?: number
          id?: string
          person_id: string
          points?: number
          sheet_id: string
          state?: Database["public"]["Enums"]["hms_state"]
        }
        Update: {
          accrued?: number
          advance?: number
          coefficient?: number
          deduction?: number
          id?: string
          person_id?: string
          points?: number
          sheet_id?: string
          state?: Database["public"]["Enums"]["hms_state"]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_lines_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "payroll_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_sheets: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string
          fot_amount: number
          fund_id: string | null
          id: string
          location_id: string | null
          number: number
          period_id: string
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by: string
          fot_amount?: number
          fund_id?: string | null
          id?: string
          location_id?: string | null
          number?: never
          period_id: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string
          fot_amount?: number
          fund_id?: string | null
          id?: string
          location_id?: string | null
          number?: never
          period_id?: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_sheets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_sheets_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_sheets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_sheets_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      period_distribution_overrides: {
        Row: {
          fixed_amount: number | null
          percent: number | null
          period_id: string
          rule_id: string
        }
        Insert: {
          fixed_amount?: number | null
          percent?: number | null
          period_id: string
          rule_id: string
        }
        Update: {
          fixed_amount?: number | null
          percent?: number | null
          period_id?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_distribution_overrides_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_distribution_overrides_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "distribution_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      position_assignments: {
        Row: {
          hat_status: Database["public"]["Enums"]["hat_status"]
          is_holder: boolean
          is_main: boolean
          person_id: string
          position_id: string
        }
        Insert: {
          hat_status?: Database["public"]["Enums"]["hat_status"]
          is_holder?: boolean
          is_main?: boolean
          person_id: string
          position_id: string
        }
        Update: {
          hat_status?: Database["public"]["Enums"]["hat_status"]
          is_holder?: boolean
          is_main?: boolean
          person_id?: string
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_assignments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          outer_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          outer_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          outer_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      reconciliations: {
        Row: {
          actual_balance: number
          cash_account_id: string
          comment: string | null
          created_at: string
          created_by: string
          difference: number | null
          id: string
          period_id: string
          system_balance: number
        }
        Insert: {
          actual_balance: number
          cash_account_id: string
          comment?: string | null
          created_at?: string
          created_by: string
          difference?: number | null
          id?: string
          period_id: string
          system_balance: number
        }
        Update: {
          actual_balance?: number
          cash_account_id?: string
          comment?: string | null
          created_at?: string
          created_by?: string
          difference?: number | null
          id?: string
          period_id?: string
          system_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      request_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          request_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          request_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          request_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_ai: boolean
          request_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_ai?: boolean
          request_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_ai?: boolean
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      statistic_values: {
        Row: {
          created_at: string
          entered_by: string | null
          id: string
          is_quota: boolean
          period_id: string
          statistic_id: string
          value: number
        }
        Insert: {
          created_at?: string
          entered_by?: string | null
          id?: string
          is_quota?: boolean
          period_id: string
          statistic_id: string
          value: number
        }
        Update: {
          created_at?: string
          entered_by?: string | null
          id?: string
          is_quota?: boolean
          period_id?: string
          statistic_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "statistic_values_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statistic_values_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statistic_values_statistic_id_fkey"
            columns: ["statistic_id"]
            isOneToOne: false
            referencedRelation: "statistics"
            referencedColumns: ["id"]
          },
        ]
      }
      statistics: {
        Row: {
          id: string
          invert: boolean
          is_archived: boolean
          is_auto: boolean
          location_id: string | null
          max_val: number | null
          min_val: number | null
          name: string
          outer_id: string | null
          owner_id: string | null
          position_id: string | null
          sign: boolean | null
          source: string | null
          stat_type: number | null
          unit: string | null
        }
        Insert: {
          id?: string
          invert?: boolean
          is_archived?: boolean
          is_auto?: boolean
          location_id?: string | null
          max_val?: number | null
          min_val?: number | null
          name: string
          outer_id?: string | null
          owner_id?: string | null
          position_id?: string | null
          sign?: boolean | null
          source?: string | null
          stat_type?: number | null
          unit?: string | null
        }
        Update: {
          id?: string
          invert?: boolean
          is_archived?: boolean
          is_auto?: boolean
          location_id?: string | null
          max_val?: number | null
          min_val?: number | null
          name?: string
          outer_id?: string | null
          owner_id?: string | null
          position_id?: string | null
          sign?: boolean | null
          source?: string | null
          stat_type?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "statistics_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statistics_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statistics_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_bills: {
        Row: {
          amount: number
          comment: string | null
          counterparty_id: string
          created_at: string
          created_by: string
          currency_id: string
          decided_at: string | null
          decided_by: string | null
          due_on: string | null
          expense_type_id: string
          fund_id: string | null
          id: string
          is_archived: boolean
          is_recurring: boolean
          issued_on: string
          kind: Database["public"]["Enums"]["bill_kind"]
          location_id: string
          number: string
          outer_id: string | null
          paid_amount: number
          period_approved_id: string | null
          period_paid_id: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          amount: number
          comment?: string | null
          counterparty_id: string
          created_at?: string
          created_by: string
          currency_id: string
          decided_at?: string | null
          decided_by?: string | null
          due_on?: string | null
          expense_type_id: string
          fund_id?: string | null
          id?: string
          is_archived?: boolean
          is_recurring?: boolean
          issued_on?: string
          kind?: Database["public"]["Enums"]["bill_kind"]
          location_id: string
          number: string
          outer_id?: string | null
          paid_amount?: number
          period_approved_id?: string | null
          period_paid_id?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          amount?: number
          comment?: string | null
          counterparty_id?: string
          created_at?: string
          created_by?: string
          currency_id?: string
          decided_at?: string | null
          decided_by?: string | null
          due_on?: string | null
          expense_type_id?: string
          fund_id?: string | null
          id?: string
          is_archived?: boolean
          is_recurring?: boolean
          issued_on?: string
          kind?: Database["public"]["Enums"]["bill_kind"]
          location_id?: string
          number?: string
          outer_id?: string | null
          paid_amount?: number
          period_approved_id?: string | null
          period_paid_id?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bills_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_expense_type_id_fkey"
            columns: ["expense_type_id"]
            isOneToOne: false
            referencedRelation: "expense_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_period_approved_id_fkey"
            columns: ["period_approved_id"]
            isOneToOne: false
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_period_paid_id_fkey"
            columns: ["period_paid_id"]
            isOneToOne: false
            referencedRelation: "fp_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          from_id: string | null
          id: string
          is_archived: boolean
          location_id: string | null
          outer_id: string | null
          position_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          to_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          from_id?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          outer_id?: string | null
          position_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          to_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          from_id?: string | null
          id?: string
          is_archived?: boolean
          location_id?: string | null
          outer_id?: string | null
          position_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          to_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_location_access: {
        Row: {
          location_id: string
          user_id: string
        }
        Insert: {
          location_id: string
          user_id: string
        }
        Update: {
          location_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_location_access_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_location_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fp_cash_transfer: {
        Args: {
          p_amount: number
          p_comment?: string
          p_from: string
          p_period_id: string
          p_to: string
        }
        Returns: undefined
      }
      fp_close_period: {
        Args: { p_period_id: string; p_protocol?: Json }
        Returns: undefined
      }
      fp_distribute_stage: {
        Args: { p_allocations: Json; p_period_id: string; p_stage: string }
        Returns: undefined
      }
      fp_fund_income: {
        Args: {
          p_amount: number
          p_comment?: string
          p_fund: string
          p_period_id: string
        }
        Returns: undefined
      }
      fp_fund_loan: {
        Args: {
          p_amount: number
          p_comment?: string
          p_from: string
          p_period_id: string
          p_to: string
        }
        Returns: number
      }
      fp_fund_loan_return: {
        Args: {
          p_amount: number
          p_comment?: string
          p_loan_id: number
          p_period_id: string
        }
        Returns: undefined
      }
      fp_fund_return: {
        Args: {
          p_amount: number
          p_comment?: string
          p_fund: string
          p_period_id: string
        }
        Returns: undefined
      }
      fp_fund_transfer: {
        Args: {
          p_amount: number
          p_comment?: string
          p_from: string
          p_period_id: string
          p_to: string
        }
        Returns: undefined
      }
      fp_pay_bill: {
        Args: {
          p_amount?: number
          p_bill_id: string
          p_cash_account_id: string
          p_period_id: string
        }
        Returns: undefined
      }
      fp_pay_invoice: {
        Args: {
          p_amount: number
          p_cash_account_id: string
          p_invoice_id: string
          p_payment_type_id: string
          p_period_id: string
          p_received_on?: string
        }
        Returns: undefined
      }
      fp_pay_payroll: {
        Args: {
          p_cash_account_id: string
          p_period_id: string
          p_sheet_id: string
        }
        Returns: undefined
      }
      fp_pay_request: {
        Args: {
          p_amount?: number
          p_cash_account_id: string
          p_period_id: string
          p_request_id: string
        }
        Returns: undefined
      }
      fp_reconcile_balances: {
        Args: never
        Returns: {
          code: string
          diff: number
          entity_id: string
          kind: string
          ledger_sum: number
          stored_balance: number
        }[]
      }
      fp_reopen_period: { Args: { p_period_id: string }; Returns: undefined }
      fp_reset_distribution: {
        Args: { p_period_id: string; p_stage: string }
        Returns: undefined
      }
      fp_reverse_bill_payment: { Args: { p_id: number }; Returns: undefined }
      fp_reverse_fund_op: { Args: { p_id: number }; Returns: undefined }
      fp_reverse_income: { Args: { p_income_id: string }; Returns: undefined }
      fp_reverse_invoice_payment: { Args: { p_income_id: string }; Returns: undefined }
      fp_reverse_request_payment: { Args: { p_id: number }; Returns: undefined }
      fp_set_period_confirmation: {
        Args: { p_period_id: string; p_kind: string; p_value: boolean }
        Returns: undefined
      }
      fp_set_fund_stage: {
        Args: {
          p_fund: string
          p_stage: Database["public"]["Enums"]["distribution_stage"]
        }
        Returns: undefined
      }
      fp_withdraw_request: { Args: { p_request_id: string }; Returns: undefined }
      has_fund_access: { Args: { f: string }; Returns: boolean }
      has_location_access: { Args: { loc: string }; Returns: boolean }
      holds_position: { Args: { pos: string }; Returns: boolean }
      is_fin_admin: { Args: never; Returns: boolean }
      mj_cron_sync: { Args: { p_entities: string[] }; Returns: number }
      mj_secret: { Args: { p_name: string }; Returns: string }
      my_role: { Args: never; Returns: Database["public"]["Enums"]["app_role"] }
      redeem_invite: {
        Args: { p_full_name?: string; p_token: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "fin_director"
        | "ops_director"
        | "location_manager"
        | "accountant"
        | "employee"
      bill_kind: "supply" | "obligation"
      cash_account_type: "cash" | "bank" | "card" | "acquiring"
      client_invoice_status: "planned" | "issued" | "paid" | "cancelled"
      crm_lead_stage: "new" | "show" | "offer" | "contract" | "won" | "lost"
      distribution_stage: "revenue" | "margin" | "adjusted"
      fund_kind: "working" | "accumulative"
      hat_status: "none" | "learning" | "done"
      hms_state:
        | "power"
        | "affluence"
        | "normal"
        | "emergency"
        | "danger"
        | "nonexistence"
      location_status: "active" | "construction" | "renovation" | "closed"
      location_type: "tuyhona" | "restaurant" | "cafe"
      period_status: "open" | "planning" | "closed"
      register_op_type:
        | "income"
        | "income_return"
        | "distribution"
        | "request_payment"
        | "fund_transfer"
        | "fund_loan"
        | "fund_loan_return"
        | "fx_exchange"
        | "cash_transfer"
        | "off_plan"
        | "adjustment"
        | "bill_payment"
        | "payroll_payment"
        | "fund_income"
        | "fund_return"
      request_status:
        | "submitted"
        | "planning"
        | "approved"
        | "rejected"
        | "paid"
        | "withdrawn"
        | "revision"
      task_priority: "low" | "mid" | "high"
      task_status: "new" | "progress" | "done"
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
  public: {
    Enums: {
      app_role: [
        "owner",
        "fin_director",
        "ops_director",
        "location_manager",
        "accountant",
        "employee",
      ],
      bill_kind: ["supply", "obligation"],
      cash_account_type: ["cash", "bank", "card", "acquiring"],
      client_invoice_status: ["planned", "issued", "paid", "cancelled"],
      crm_lead_stage: ["new", "show", "offer", "contract", "won", "lost"],
      distribution_stage: ["revenue", "margin", "adjusted"],
      fund_kind: ["working", "accumulative"],
      hat_status: ["none", "learning", "done"],
      hms_state: [
        "power",
        "affluence",
        "normal",
        "emergency",
        "danger",
        "nonexistence",
      ],
      location_status: ["active", "construction", "renovation", "closed"],
      location_type: ["tuyhona", "restaurant", "cafe"],
      period_status: ["open", "planning", "closed"],
      register_op_type: [
        "income",
        "income_return",
        "distribution",
        "request_payment",
        "fund_transfer",
        "fund_loan",
        "fund_loan_return",
        "fx_exchange",
        "cash_transfer",
        "off_plan",
        "adjustment",
        "bill_payment",
        "payroll_payment",
        "fund_income",
        "fund_return",
      ],
      request_status: ["submitted", "planning", "approved", "rejected", "paid"],
      task_priority: ["low", "mid", "high"],
      task_status: ["new", "progress", "done"],
    },
  },
} as const
