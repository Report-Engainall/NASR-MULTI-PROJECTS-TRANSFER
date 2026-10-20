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
      admin_settings: {
        Row: {
          category: string
          created_at: string
          id: string
          key: string
          organization_id: string | null
          updated_at: string
          value: Json | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          key: string
          organization_id?: string | null
          updated_at?: string
          value?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          key?: string
          organization_id?: string | null
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_alerts: {
        Row: {
          alert_type: string
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_resolved: boolean
          organization_id: string | null
          severity: string
          title: string
        }
        Insert: {
          alert_type: string
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_resolved?: boolean
          organization_id?: string | null
          severity?: string
          title: string
        }
        Update: {
          alert_type?: string
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_resolved?: boolean
          organization_id?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          organization_id: string | null
          priority: string
          status: string
          task_type: string | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string | null
          priority?: string
          status?: string
          task_type?: string | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string | null
          priority?: string
          status?: string
          task_type?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          parent_id?: string | null
          sort_order?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          parent_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          item_code: string | null
          line_total: number
          organization_id: string
          product_id: string | null
          quantity: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          item_code?: string | null
          line_total: number
          organization_id: string
          product_id?: string | null
          quantity: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          item_code?: string | null
          line_total?: number
          organization_id?: string
          product_id?: string | null
          quantity?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_invoices: {
        Row: {
          created_at: string
          currency: string
          customer_id: string
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string
          order_id: string
          organization_id: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id: string
          due_at?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          order_id: string
          organization_id: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          order_id?: string
          organization_id?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          invoice_id: string
          notes: string | null
          organization_id: string
          paid_at: string
          payment_method: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          invoice_id: string
          notes?: string | null
          organization_id: string
          paid_at?: string
          payment_method: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string
          payment_method?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          approved_at: string | null
          business_name: string
          contact_name: string | null
          created_at: string
          credit_limit: number | null
          current_balance: number | null
          customer_code: string
          email: string | null
          id: string
          organization_id: string
          phone: string | null
          profile_id: string | null
          status: string
          tier: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          business_name: string
          contact_name?: string | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number | null
          customer_code: string
          email?: string | null
          id?: string
          organization_id: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          tier?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          business_name?: string
          contact_name?: string | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number | null
          customer_code?: string
          email?: string | null
          id?: string
          organization_id?: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_job_rows: {
        Row: {
          created_at: string
          data: Json | null
          errors: Json | null
          id: string
          import_job_id: string
          row_number: number
          status: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          errors?: Json | null
          id?: string
          import_job_id: string
          row_number: number
          status?: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          errors?: Json | null
          id?: string
          import_job_id?: string
          row_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_job_rows_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          data_quality_score: number | null
          error_summary: Json | null
          failed_rows: number | null
          file_hash: string | null
          file_name: string | null
          file_size: number | null
          id: string
          job_type: string
          organization_id: string | null
          processed_rows: number | null
          status: string
          success_rows: number | null
          total_rows: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          data_quality_score?: number | null
          error_summary?: Json | null
          failed_rows?: number | null
          file_hash?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          job_type: string
          organization_id?: string | null
          processed_rows?: number | null
          status?: string
          success_rows?: number | null
          total_rows?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          data_quality_score?: number | null
          error_summary?: Json | null
          failed_rows?: number | null
          file_hash?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          job_type?: string
          organization_id?: string | null
          processed_rows?: number | null
          status?: string
          success_rows?: number | null
          total_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          created_at: string
          id: string
          last_movement_at: string | null
          product_id: string
          quantity_available: number | null
          quantity_on_hand: number
          quantity_reserved: number
          reorder_point: number | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_movement_at?: string | null
          product_id: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          reorder_point?: number | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_movement_at?: string | null
          product_id?: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          reorder_point?: number | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          balance_after: number | null
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          warehouse_id: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          warehouse_id: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
          organization_id: string | null
          profile_id: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          organization_id?: string | null
          profile_id?: string | null
          title: string
          type?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          organization_id?: string | null
          profile_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          discount_snapshot: number
          id: string
          item_code: string | null
          line_total: number
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_snapshot: number
          unit_snapshot: string | null
        }
        Insert: {
          created_at?: string
          discount_snapshot?: number
          id?: string
          item_code?: string | null
          line_total?: number
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity?: number
          unit_price_snapshot?: number
          unit_snapshot?: string | null
        }
        Update: {
          created_at?: string
          discount_snapshot?: number
          id?: string
          item_code?: string | null
          line_total?: number
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          unit_price_snapshot?: number
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          notes: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          idempotency_key: string | null
          notes: string | null
          order_number: string
          organization_id: string
          status: string
          total_amount: number
          total_items: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          order_number: string
          organization_id: string
          status?: string
          total_amount?: number
          total_items?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          order_number?: string
          organization_id?: string
          status?: string
          total_amount?: number
          total_items?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      outbox_events: {
        Row: {
          aggregate_id: string | null
          attempts: number
          created_at: string
          error_class: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          organization_id: string | null
          payload: Json | null
          provider_reference: string | null
          status: string
        }
        Insert: {
          aggregate_id?: string | null
          attempts?: number
          created_at?: string
          error_class?: string | null
          event_type: string
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          organization_id?: string | null
          payload?: Json | null
          provider_reference?: string | null
          status?: string
        }
        Update: {
          aggregate_id?: string | null
          attempts?: number
          created_at?: string
          error_class?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          organization_id?: string | null
          payload?: Json | null
          provider_reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      price_change_log: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_price: number | null
          old_price: number | null
          product_id: string | null
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price?: number | null
          old_price?: number | null
          product_id?: string | null
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price?: number | null
          old_price?: number | null
          product_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_change_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_change_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          adjustment_type: string
          adjustment_value: number
          base_type: string
          created_at: string
          id: string
          is_active: boolean
          max_price: number | null
          min_price: number | null
          name: string
          organization_id: string
          priority: number
          scope_type: string
          scope_value: string | null
          updated_at: string
        }
        Insert: {
          adjustment_type?: string
          adjustment_value?: number
          base_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_price?: number | null
          min_price?: number | null
          name: string
          organization_id: string
          priority?: number
          scope_type?: string
          scope_value?: string | null
          updated_at?: string
        }
        Update: {
          adjustment_type?: string
          adjustment_value?: number
          base_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_price?: number | null
          min_price?: number | null
          name?: string
          organization_id?: string
          priority?: number
          scope_type?: string
          scope_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          min_quantity: number
          price: number
          product_id: string
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          min_quantity?: number
          price?: number
          product_id: string
          tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          min_quantity?: number
          price?: number
          product_id?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          base_price: number
          category_id: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          item_code: string
          max_stock: number | null
          min_stock: number | null
          name: string
          organization_id: string
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          base_price?: number
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          item_code: string
          max_stock?: number | null
          min_stock?: number | null
          name: string
          organization_id: string
          status?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          base_price?: number
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          item_code?: string
          max_stock?: number | null
          min_stock?: number | null
          name?: string
          organization_id?: string
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          organization_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          category_ids: string[] | null
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          end_date: string
          id: string
          is_active: boolean
          organization_id: string
          product_ids: string[] | null
          start_date: string
          title: string
        }
        Insert: {
          category_ids?: string[] | null
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date: string
          id?: string
          is_active?: boolean
          organization_id: string
          product_ids?: string[] | null
          start_date: string
          title: string
        }
        Update: {
          category_ids?: string[] | null
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          product_ids?: string[] | null
          start_date?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reorder_template_items: {
        Row: {
          created_at: string
          id: string
          item_code: string | null
          organization_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_code?: string | null
          organization_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_code?: string | null
          organization_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reorder_template_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_template_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reorder_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reorder_templates: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          name: string
          organization_id: string
          source_order_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          name: string
          organization_id: string
          source_order_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          name?: string
          organization_id?: string
          source_order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reorder_templates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_templates_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quote_items: {
        Row: {
          created_at: string
          id: string
          item_code: string | null
          organization_id: string
          product_id: string | null
          product_name_snapshot: string
          quote_id: string
          quoted_unit_price: number | null
          requested_quantity: number
          target_unit_price: number | null
          unit_snapshot: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_code?: string | null
          organization_id: string
          product_id?: string | null
          product_name_snapshot: string
          quote_id: string
          quoted_unit_price?: number | null
          requested_quantity: number
          target_unit_price?: number | null
          unit_snapshot?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_code?: string | null
          organization_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quote_id?: string
          quoted_unit_price?: number | null
          requested_quantity?: number
          target_unit_price?: number | null
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_quote_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quotes: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          notes: string | null
          organization_id: string
          quote_number: string
          quoted_at: string | null
          responded_by: string | null
          response_note: string | null
          status: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          organization_id: string
          quote_number: string
          quoted_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          quote_number?: string
          quoted_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          status: string
          supplier_code: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          status?: string
          supplier_code: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          status?: string
          supplier_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          branch_id: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
        }
        Insert: {
          branch_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
        }
        Update: {
          branch_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_profile_id: { Args: never; Returns: string }
      customer_respond_to_quote: {
        Args: { p_accept: boolean; p_quote_id: string }
        Returns: undefined
      }
      ensure_profile: { Args: { _full_name?: string }; Returns: Json }
      is_staff: { Args: never; Returns: boolean }
      place_order: {
        Args: {
          _business_name: string
          _contact_name: string
          _items: Json
          _notes: string
          _phone: string
        }
        Returns: Json
      }
      record_customer_payment: {
        Args: {
          p_amount: number
          p_invoice_id: string
          p_notes?: string
          p_payment_method: string
          p_reference?: string
        }
        Returns: string
      }
      request_sales_quote: {
        Args: { p_lines: Json; p_notes?: string }
        Returns: string
      }
      respond_to_sales_quote: {
        Args: {
          p_prices: Json
          p_quote_id: string
          p_response_note?: string
          p_valid_until?: string
        }
        Returns: undefined
      }
      save_reorder_template: {
        Args: { p_lines: Json; p_name: string; p_source_order_id?: string }
        Returns: string
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
