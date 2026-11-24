export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          name: string;
          phone: string;
          address: string | null;
          visit_count: number;
          reward_claimed: boolean;
          rewards_redeemed: number;
          last_visit: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          address?: string | null;
          visit_count?: number;
          reward_claimed?: boolean;
          rewards_redeemed?: number;
          last_visit?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          address?: string | null;
          visit_count?: number;
          reward_claimed?: boolean;
          rewards_redeemed?: number;
          last_visit?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          name: string;
          phone: string;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          action: string;
          entity_type: string;
          entity_id: string;
          actor_phone: string | null;
          actor_name: string | null;
          changes: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action: string;
          entity_type: string;
          entity_id: string;
          actor_phone?: string | null;
          actor_name?: string | null;
          changes?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          actor_phone?: string | null;
          actor_name?: string | null;
          changes?: Json | null;
          created_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          client_id: string;
          total: number;
          payment_method: string;
          status: "pending" | "completed" | "cancelled";
          pickup_date: string | null;
          pickup_time: string | null;
          notes: string | null;
          created_by_name: string | null;
          created_by_phone: string | null;
          paid: boolean | null;
          section: string | null;
          hangers_brought: boolean | null;
          hangers_count: number | null;
          covers_brought: boolean | null;
          covers_count: number | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          client_id: string;
          total: number;
          payment_method: string;
          status?: "pending" | "completed" | "cancelled";
          pickup_date?: string | null;
          pickup_time?: string | null;
          notes?: string | null;
          created_by_name?: string | null;
          created_by_phone?: string | null;
          paid?: boolean | null;
          section?: string | null;
          hangers_brought?: boolean | null;
          hangers_count?: number | null;
          covers_brought?: boolean | null;
          covers_count?: number | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          total?: number;
          payment_method?: string;
          status?: "pending" | "completed" | "cancelled";
          pickup_date?: string | null;
          pickup_time?: string | null;
          notes?: string | null;
          created_by_name?: string | null;
          created_by_phone?: string | null;
          paid?: boolean | null;
          section?: string | null;
          hangers_brought?: boolean | null;
          hangers_count?: number | null;
          covers_brought?: boolean | null;
          covers_count?: number | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          invoice_id: string;
          amount: number;
          method: string;
          paid_by_name: string | null;
          paid_by_phone: string | null;
          account: "cleaner_phone" | "products_phone" | "cash" | null;
          status: "confirmed" | "pending";
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          amount: number;
          method: string;
          paid_by_name?: string | null;
          paid_by_phone?: string | null;
          account?: "cleaner_phone" | "products_phone" | "cash" | null;
          status?: "confirmed" | "pending";
          created_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          amount?: number;
          method?: string;
          paid_by_name?: string | null;
          paid_by_phone?: string | null;
          account?: "cleaner_phone" | "products_phone" | "cash" | null;
          status?: "confirmed" | "pending";
          created_at?: string;
        };
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          description: string;
          quantity: number;
          unit_price: number;
          total_price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          description: string;
          quantity: number;
          unit_price: number;
          total_price: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          description?: string;
          quantity?: number;
          unit_price?: number;
          total_price?: number;
          created_at?: string;
        };
      };
      invoice_photos: {
        Row: {
          id: string;
          invoice_id: string;
          item_label: string | null;
          storage_path: string;
          bytes: number;
          width: number | null;
          height: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          item_label?: string | null;
          storage_path: string;
          bytes?: number;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          item_label?: string | null;
          storage_path?: string;
          bytes?: number;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
      };
      daily_balances: {
        Row: {
          id: string;
          report_date: string;
          opening_cleaner_phone: number;
          opening_products_phone: number;
          opening_cash: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          report_date: string;
          opening_cleaner_phone?: number;
          opening_products_phone?: number;
          opening_cash?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          report_date?: string;
          opening_cleaner_phone?: number;
          opening_products_phone?: number;
          opening_cash?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      withdrawals: {
        Row: {
          id: string;
          withdrawn_at: string;
          account: "cleaner_phone" | "products_phone" | "cash";
          amount: number;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          withdrawn_at?: string;
          account: "cleaner_phone" | "products_phone" | "cash";
          amount: number;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          withdrawn_at?: string;
          account?: "cleaner_phone" | "products_phone" | "cash";
          amount?: number;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
      };
      extra_sales: {
        Row: {
          id: string;
          sold_at: string;
          category: "product" | "extra";
          description: string;
          quantity: number;
          total_price: number;
          amount_paid_cash: number;
          amount_paid_momo: number;
          account: "cleaner_phone" | "products_phone" | "cash" | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sold_at?: string;
          category: "product" | "extra";
          description: string;
          quantity?: number;
          total_price: number;
          amount_paid_cash?: number;
          amount_paid_momo?: number;
          account?: "cleaner_phone" | "products_phone" | "cash" | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sold_at?: string;
          category?: "product" | "extra";
          description?: string;
          quantity?: number;
          total_price?: number;
          amount_paid_cash?: number;
          amount_paid_momo?: number;
          account?: "cleaner_phone" | "products_phone" | "cash" | null;
          created_by?: string | null;
          created_at?: string;
        };
      };
    };
  };
}
