"use client";

import { create } from "zustand";
import { supabase } from "./supabase";
import type { Client, Invoice, InvoiceItem, UserAccount } from "./types";
import { toast } from "@/hooks/use-toast";
import { RealtimeChannel } from "@supabase/supabase-js";
import { getLocalDateString, generateInvoiceId, normalizePhoneForMatch } from "./utils";

// One group of clients that look like the same person, e.g. from a
// duplicate created before pagination bugs were fixed. `key` is the
// normalized phone number they share.
export interface DuplicateClientGroup {
  key: string;
  clients: Client[];
}

interface SupabaseStore {
  invoices: Invoice[];
  clients: Client[];
  currentUserPhone: string | null;
  currentUserName: string | null;
  loading: boolean;
  error: string | null;
  isInitialized: boolean;
  databaseReady: boolean;
  realtimeChannel: RealtimeChannel | null;

  // Pagination state
  invoicesPage: number;
  allInvoicesLoaded: boolean;
  isLoadingMore: boolean;

  // Network status — used to switch to a read-only view of the last
  // successfully synced data instead of a dead "no internet" screen.
  isOnline: boolean;
  lastSyncedAt: string | null;
  subscribeToNetworkStatus: () => void;

  // Database setup
  checkDatabaseSetup: () => Promise<boolean>;
  initializeDatabase: () => Promise<void>;

  // Client operations
  loadClients: () => Promise<void>;
  addClient: (
    client: Omit<Client, "id" | "createdAt" | "updatedAt">
  ) => Promise<Client | null>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  findDuplicateClients: () => DuplicateClientGroup[];
  mergeClients: (keepId: string, mergeIds: string[]) => Promise<void>;
  redeemClientReward: (clientId: string) => Promise<void>;

  // Invoice operations
  loadInvoices: () => Promise<void>;
  loadMoreInvoices: () => Promise<void>;
  searchInvoicesDb: (query: string) => Promise<Invoice[]>;
  fetchRecentCompleted: (filter: "completed" | "paid", limit: number) => Promise<Invoice[]>;
  fetchInvoicesForDateRange: (fromIso: string, toIso: string) => Promise<Invoice[]>;
  addInvoice: (
    invoice: Omit<Invoice, "updatedAt"> & {
      createdAt?: string;
      // Payment(s) taken at the moment of creation — lets a client split
      // between methods (part cash, part MoMo) or pay only part of the
      // total up front, right from the invoice form. Falls back to a
      // single full payment for `paymentMethod` if omitted.
      initialPayments?: { amount: number; method: string }[];
    }
  ) => Promise<void>;
  updateInvoice: (id: string, invoice: Partial<Invoice>) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  addPayment: (invoiceId: string, amount: number, method: string) => Promise<void>;
  // Batches several payment lines into one invoice in a single pass — used
  // by the "Split Payment" option in the Record Payment dialog so entering
  // part cash + part MoMo doesn't need reopening the dialog per line.
  addPayments: (
    invoiceId: string,
    lines: { amount: number; method: string }[]
  ) => Promise<void>;
  // Corrects a mistake in an already-recorded payment (wrong amount or
  // method) instead of only being able to delete it or wipe all payments.
  updatePayment: (
    invoiceId: string,
    paymentId: string,
    amount: number,
    method: string
  ) => Promise<void>;
  deletePayment: (invoiceId: string, paymentId: string) => Promise<void>;

  // Pickup notifications
  getPickupNotifications: () => Invoice[];

  // Utility
  loadData: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
  setCurrentUser: (phone: string, name?: string) => Promise<void>;
  signOut: () => void;

  subscribeToRealTimeUpdates: () => void;
  unsubscribeFromRealTimeUpdates: () => void;
  updateInvoiceStatus: (
    id: string,
    status: "pending" | "completed" | "cancelled"
  ) => Promise<void>;
  updateInvoicePaid: (id: string, paid: boolean) => Promise<void>;
  updateInvoicePaymentMethod: (id: string, paymentMethod: string) => Promise<void>;
  updateInvoiceSection: (id: string, section: string | null) => Promise<void>;
}

// Called at the top of every write action. Offline mode is read-only —
// clearly refuse to save rather than let a write hang/fail confusingly,
// or silently disagree with what the last-synced data on screen shows.
function assertOnline(get: () => { isOnline: boolean }) {
  if (!get().isOnline) {
    const message = "You're offline — connect to the internet to save changes.";
    toast({ title: "Offline", description: message, variant: "destructive" });
    throw new Error(message);
  }
}

// Cached probe: have the actor-tracking columns been migrated yet?
// null = not checked yet, true/false = result cached for this session.
let actorColumnsReady: boolean | null = null;

async function checkActorColumns(): Promise<boolean> {
  if (actorColumnsReady !== null) return actorColumnsReady;
  try {
    const { error } = await supabase
      .from("invoices")
      .select("completed_by_name, completed_by_phone, paid_by_name, paid_by_phone")
      .limit(1);
    actorColumnsReady = !error;
  } catch {
    actorColumnsReady = false;
  }
  return actorColumnsReady;
}

// Cached probe: has scripts/add-completed-at.sql been run yet? Same
// backward-compatible pattern as checkActorColumns.
let completedAtColumnReady: boolean | null = null;

async function checkCompletedAtColumn(): Promise<boolean> {
  if (completedAtColumnReady !== null) return completedAtColumnReady;
  try {
    const { error } = await supabase.from("invoices").select("completed_at").limit(1);
    completedAtColumnReady = !error;
  } catch {
    completedAtColumnReady = false;
  }
  return completedAtColumnReady;
}

export const useSupabaseStore = create<SupabaseStore>((set, get) => ({
  invoices: [],
  clients: [],
  currentUserPhone: null,
  currentUserName: null,
  loading: false,
  error: null,
  isInitialized: false,
  databaseReady: false,
  realtimeChannel: null,

  // Pagination state
  invoicesPage: 0,
  allInvoicesLoaded: false,
  isLoadingMore: false,

  // Network status
  isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  lastSyncedAt: null,

  subscribeToNetworkStatus: () => {
    if (typeof window === "undefined") return;
    const goOnline = () => {
      set({ isOnline: true });
      // Quietly catch back up the moment the connection returns.
      get().loadData().catch(() => {});
    };
    const goOffline = () => set({ isOnline: false });
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      invoices: [],
      clients: [],
      loading: false,
      error: null,
      isInitialized: false,
      databaseReady: false,
      currentUserPhone: null,
      currentUserName: null,
      // Reset pagination state
      invoicesPage: 0,
      allInvoicesLoaded: false,
      isLoadingMore: false,
    }),

  setCurrentUser: async (phone, name) => {
    const normalized = phone.trim();
    try {
      // Check that user exists in users table (admin-managed accounts)
      const { data: existing, error } = await supabase
        .from("users")
        .select("name, phone")
        .eq("phone", normalized)
        .maybeSingle();

      if (error) {
        console.warn("User lookup failed", error);
      }

      if (!existing) {
        toast({
          title: "Account not found",
          description: "Ask admin to create your account first.",
          variant: "destructive",
        });
        return;
      }

      const resolvedName = existing.name || name || null;
      // store locally
      if (typeof window !== "undefined") {
        localStorage.setItem("ims_user_phone", normalized);
        if (resolvedName) localStorage.setItem("ims_user_name", resolvedName);
      }
      set({ currentUserPhone: normalized, currentUserName: resolvedName });
    } catch (e) {
      console.warn("Failed to ensure user record", e);
      toast({
        title: "Login failed",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  },

  signOut: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("ims_user_phone");
      localStorage.removeItem("ims_user_name");
    }
    set({ currentUserPhone: null, currentUserName: null });
  },

  checkDatabaseSetup: async () => {
    try {
      console.log("Checking database setup...");

      // Test connection to Supabase
      const { data: connectionTest, error: connectionError } = await supabase
        .from("clients")
        .select("count", { count: "exact", head: true });

      if (connectionError) {
        console.error("Database connection error:", connectionError);

        // Check if it's a table not found error
        if (
          connectionError.message.includes("does not exist") ||
          connectionError.message.includes("schema cache") ||
          connectionError.message.includes("relation") ||
          connectionError.message.includes("table")
        ) {
          console.log("Tables do not exist, setup required");
          set({ databaseReady: false });
          return false;
        }

        throw connectionError;
      }

      console.log("Database setup check passed");
      set({ databaseReady: true });
      return true;
    } catch (error: any) {
      console.error("Database setup check failed:", error);
      set({
        databaseReady: false,
        error: `Database setup required: ${error.message}`,
      });
      return false;
    }
  },

  initializeDatabase: async () => {
    try {
      set({ loading: true, error: null });

      const isReady = await get().checkDatabaseSetup();
      if (isReady) {
        // hydrate local user if present
        if (typeof window !== "undefined") {
          const phone = localStorage.getItem("ims_user_phone");
          const name = localStorage.getItem("ims_user_name");
          if (phone) {
            // Try to resolve a friendly name from users table if not present
            let resolvedName = name || null;
            try {
              if (!resolvedName) {
                const { data: u } = await supabase
                  .from("users")
                  .select("name")
                  .eq("phone", phone)
                  .maybeSingle();
                if (u?.name) {
                  resolvedName = u.name as string;
                  localStorage.setItem("ims_user_name", resolvedName);
                }
              }
            } catch {}
            set({ currentUserPhone: phone, currentUserName: resolvedName });
          }
        }
        await get().loadData();
        get().subscribeToRealTimeUpdates(); // Add this line
        set({ isInitialized: true, loading: false });
        console.log("Database initialized successfully with real-time updates");
      } else {
        set({
          error:
            "Database tables not found. Please run the setup script in Supabase SQL Editor.",
          loading: false,
          databaseReady: false,
        });
      }
    } catch (error: any) {
      console.error("Database initialization error:", error);
      set({
        error: `Database initialization failed: ${error.message}`,
        loading: false,
        databaseReady: false,
      });
    }
  },

  loadClients: async () => {
    try {
      // Supabase/PostgREST caps a single request at 1000 rows by default —
      // page through in batches so a growing client list never silently
      // loses the older half of it.
      const pageSize = 1000;
      const allRows: any[] = [];
      let page = 0;

      for (;;) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from("clients")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, to);

        if (error) {
          console.error("Error loading clients:", error);
          throw new Error(`Failed to load clients: ${error.message}`);
        }
        if (!data || data.length === 0) break;

        allRows.push(...data);
        if (data.length < pageSize) break;
        page++;
      }

      const clients: Client[] = allRows.map((client) => ({
        id: client.id,
        name: client.name,
        phone: client.phone,
        address: client.address || "",
        visitCount: client.visit_count || 0,
        rewardClaimed: client.reward_claimed || false,
        rewardsRedeemed: client.rewards_redeemed || 0,
        lastVisit: client.last_visit || new Date().toISOString(),
        createdAt: client.created_at,
        updatedAt: client.updated_at,
      }));

      set({ clients });
      console.log(`Loaded ${clients.length} clients`);
    } catch (error: any) {
      console.error("Error loading clients:", error);
      throw error;
    }
  },

  addClient: async (clientData) => {
    assertOnline(get);
    try {
      set({ loading: true, error: null });

      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: clientData.name,
          phone: clientData.phone,
          address: clientData.address || null,
          visit_count: clientData.visitCount || 0,
          reward_claimed: clientData.rewardClaimed || false,
          rewards_redeemed: clientData.rewardsRedeemed || 0,
          last_visit: clientData.lastVisit || new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("Error adding client:", error);
        throw new Error(`Failed to add client: ${error.message}`);
      }

      const newClient: Client = {
        id: data.id,
        name: data.name,
        phone: data.phone,
        address: data.address || "",
        visitCount: data.visit_count || 0,
        rewardClaimed: data.reward_claimed || false,
        rewardsRedeemed: data.rewards_redeemed || 0,
        lastVisit: data.last_visit || new Date().toISOString(),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      set((state) => ({
        clients: [newClient, ...state.clients],
        loading: false,
      }));

      toast({
        title: "Client added successfully!",
        description: `${newClient.name} has been added to your client list.`,
      });

      // audit log
      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "create",
          entity_type: "client",
          entity_id: newClient.id,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: { name: newClient.name, phone: newClient.phone },
        });
      } catch {}

      return newClient;
    } catch (error: any) {
      console.error("Error adding client:", error);
      const errorMessage = error.message || "Failed to add client";
      set({ error: errorMessage, loading: false });
      toast({
        title: "Error adding client",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    }
  },

  updateClient: async (id, updates) => {
    assertOnline(get);
    try {
      set({ loading: true, error: null });

      const updateData: any = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.phone !== undefined) updateData.phone = updates.phone;
      if (updates.address !== undefined)
        updateData.address = updates.address || null;
      if (updates.visitCount !== undefined)
        updateData.visit_count = updates.visitCount;
      if (updates.rewardClaimed !== undefined)
        updateData.reward_claimed = updates.rewardClaimed;
      if (updates.lastVisit !== undefined)
        updateData.last_visit = updates.lastVisit;

      const { error } = await supabase
        .from("clients")
        .update(updateData)
        .eq("id", id);

      if (error) {
        throw new Error(`Failed to update client: ${error.message}`);
      }

      set((state) => ({
        clients: state.clients.map((client) =>
          client.id === id
            ? { ...client, ...updates, updatedAt: new Date().toISOString() }
            : client
        ),
        loading: false,
      }));

      // audit log
      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "update",
          entity_type: "client",
          entity_id: id,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: updates as any,
        });
      } catch {}

      toast({
        title: "Client updated successfully!!",
      });
    } catch (error: any) {
      console.error("Error updating client:", error);
      const errorMessage = error.message || "Failed to update client";
      set({ error: errorMessage, loading: false });
      toast({
        title: "Error updating client",
        description: errorMessage,
        variant: "destructive",
      });
    }
  },

  deleteClient: async (id) => {
    assertOnline(get);
    try {
      set({ loading: true, error: null });

      const { error } = await supabase.from("clients").delete().eq("id", id);

      if (error) {
        throw new Error(`Failed to delete client: ${error.message}`);
      }

      set((state) => ({
        clients: state.clients.filter((client) => client.id !== id),
        loading: false,
      }));

      // audit log
      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "delete",
          entity_type: "client",
          entity_id: id,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
        });
      } catch {}

      toast({
        title: "Client deleted successfully!",
      });
    } catch (error: any) {
      console.error("Error deleting client:", error);
      const errorMessage = error.message || "Failed to delete client";
      set({ error: errorMessage, loading: false });
      toast({
        title: "Error deleting client",
        description: errorMessage,
        variant: "destructive",
      });
    }
  },

  // Groups clients that share the same phone number once formatting
  // differences are normalized away — e.g. a real duplicate created while
  // loadClients() was silently missing rows past Supabase's 1000-row cap.
  findDuplicateClients: () => {
    const byPhone = new Map<string, Client[]>();
    for (const client of get().clients) {
      const key = normalizePhoneForMatch(client.phone);
      if (!key) continue;
      const group = byPhone.get(key);
      if (group) group.push(client);
      else byPhone.set(key, [client]);
    }
    return Array.from(byPhone.entries())
      .filter(([, group]) => group.length > 1)
      .map(([key, clients]) => ({
        key,
        // Oldest first — usually the record other systems/history point to.
        clients: [...clients].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
      }));
  },

  // Folds `mergeIds` into `keepId`: reassigns their invoices, combines
  // visit counts and reward redemptions, keeps the best address, then
  // deletes the now-empty duplicate rows.
  mergeClients: async (keepId, mergeIds) => {
    assertOnline(get);
    const ids = mergeIds.filter((id) => id !== keepId);
    if (ids.length === 0) return;

    try {
      set({ loading: true, error: null });

      const { clients } = get();
      const keep = clients.find((c) => c.id === keepId);
      const merging = clients.filter((c) => ids.includes(c.id));
      if (!keep) throw new Error("Client to keep not found");

      const combinedVisitCount =
        keep.visitCount + merging.reduce((sum, c) => sum + c.visitCount, 0);
      const combinedRewardsRedeemed =
        keep.rewardsRedeemed + merging.reduce((sum, c) => sum + c.rewardsRedeemed, 0);
      const bestAddress = keep.address || merging.find((c) => c.address)?.address || null;
      const earliestVisit = [keep, ...merging]
        .map((c) => c.lastVisit)
        .sort()[0];

      // Point every invoice from the duplicates at the surviving record.
      const { error: reassignError } = await supabase
        .from("invoices")
        .update({ client_id: keepId })
        .in("client_id", ids);
      if (reassignError)
        throw new Error(`Failed to move invoices: ${reassignError.message}`);

      const { error: updateError } = await supabase
        .from("clients")
        .update({
          visit_count: combinedVisitCount,
          rewards_redeemed: combinedRewardsRedeemed,
          address: bestAddress,
          last_visit: earliestVisit,
        })
        .eq("id", keepId);
      if (updateError)
        throw new Error(`Failed to update merged client: ${updateError.message}`);

      const { error: deleteError } = await supabase
        .from("clients")
        .delete()
        .in("id", ids);
      if (deleteError)
        throw new Error(`Failed to remove duplicate clients: ${deleteError.message}`);

      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "merge",
          entity_type: "client",
          entity_id: keepId,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: { mergedIds: ids },
        });
      } catch {}

      await get().loadClients();
      await get().loadInvoices();
      set({ loading: false });

      toast({ title: `Merged ${ids.length} duplicate${ids.length > 1 ? "s" : ""} into ${keep.name}` });
    } catch (error: any) {
      const errorMessage = error.message || "Failed to merge clients";
      set({ error: errorMessage, loading: false });
      toast({
        title: "Error merging clients",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    }
  },

  redeemClientReward: async (clientId) => {
    assertOnline(get);
    try {
      const client = get().clients.find((c) => c.id === clientId);
      if (!client) throw new Error("Client not found");

      const { getRewardsAvailable } = await import("./loyalty");
      if (getRewardsAvailable(client) <= 0) {
        throw new Error("This client has no reward available to redeem");
      }

      const newRedeemedCount = client.rewardsRedeemed + 1;
      const { error } = await supabase
        .from("clients")
        .update({ rewards_redeemed: newRedeemedCount })
        .eq("id", clientId);

      if (error) throw new Error(`Failed to redeem reward: ${error.message}`);

      set((state) => ({
        clients: state.clients.map((c) =>
          c.id === clientId ? { ...c, rewardsRedeemed: newRedeemedCount } : c
        ),
      }));

      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "reward_redeemed",
          entity_type: "client",
          entity_id: clientId,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
        });
      } catch {}

      toast({ title: `Reward redeemed for ${client.name}` });
    } catch (error: any) {
      toast({
        title: "Error redeeming reward",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  },

  loadInvoices: async () => {
    try {
      // Reset pagination state for fresh load
      set({ invoicesPage: 0, allInvoicesLoaded: false, isLoadingMore: false });

      // Load first batch of 50 invoices with joins
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select(`
          *,
          client:clients(*),
          invoice_items(*), payments(*)
        `)
        .order("created_at", { ascending: false })
        .range(0, 49); // Load first 50 invoices

      if (invoicesError) {
        console.error("Error loading invoices:", invoicesError);
        throw new Error(`Failed to load invoices: ${invoicesError.message}`);
      }

      if (!invoicesData || invoicesData.length === 0) {
        set({ invoices: [], allInvoicesLoaded: true });
        console.log("Loaded 0 invoices");
        return;
      }

      // Transform the data
      const invoices: Invoice[] = invoicesData
        .map((invoice) => {
          if (!invoice.client) {
            console.warn(`Client not found for invoice ${invoice.id}`);
            return null;
          }

          const payments = (invoice.payments || []).map((p: any) => ({
            id: p.id,
            amount: parseFloat(p.amount),
            method: p.method,
            paidByName: p.paid_by_name || undefined,
            paidByPhone: p.paid_by_phone || undefined,
            createdAt: p.created_at,
          }));
          const invoiceTotal = parseFloat(invoice.total);
          const amountPaid = payments.reduce((sum: number, p: any) => sum + p.amount, 0);

          return {
            id: invoice.id,
            client: {
              id: invoice.client.id,
              name: invoice.client.name,
              phone: invoice.client.phone,
              address: invoice.client.address || "",
              visitCount: invoice.client.visit_count || 0,
              rewardClaimed: invoice.client.reward_claimed || false,
              lastVisit: invoice.client.last_visit || new Date().toISOString(),
              createdAt: invoice.client.created_at,
              updatedAt: invoice.client.updated_at,
            },
            items: (invoice.invoice_items || []).map((item: any) => ({
              id: item.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: parseFloat(item.unit_price),
              totalPrice: parseFloat(item.total_price),
            })),
            total: parseFloat(invoice.total),
            paymentMethod: invoice.payment_method,
            paid: invoice.paid ?? false,
            payments,
            amountPaid,
            balanceDue: Math.max(0, invoiceTotal - amountPaid),
            status: invoice.status,
            pickupDate: invoice.pickup_date || undefined,
            pickupTime: invoice.pickup_time || undefined,
            notes: invoice.notes || undefined,
            section: invoice.section || undefined,
            hangersBrought: invoice.hangers_brought ?? undefined,
            hangersCount: invoice.hangers_count ?? undefined,
            coversBrought: invoice.covers_brought ?? undefined,
            coversCount: invoice.covers_count ?? undefined,
            createdByName: invoice.created_by_name || undefined,
            createdByPhone: invoice.created_by_phone || undefined,
            completedByName: invoice.completed_by_name || undefined,
            completedByPhone: invoice.completed_by_phone || undefined,
            completedAt: invoice.completed_at || undefined,
            paidByName: invoice.paid_by_name || undefined,
            paidByPhone: invoice.paid_by_phone || undefined,
            createdAt: invoice.created_at,
            updatedAt: invoice.updated_at,
          };
        })
        .filter(Boolean) as Invoice[];

      // Check if we've loaded all invoices
      const allLoaded = invoicesData.length < 50;

      set({ 
        invoices, 
        invoicesPage: 1, 
        allInvoicesLoaded: allLoaded 
      });
      console.log(`Loaded ${invoices.length} invoices (initial batch)`);
    } catch (error: any) {
      console.error("Error loading invoices:", error);
      throw error;
    }
  },

  loadMoreInvoices: async () => {
    try {
      const { invoicesPage, allInvoicesLoaded, isLoadingMore } = get();
      
      // Don't load if already loading or all invoices are loaded
      if (allInvoicesLoaded || isLoadingMore) {
        return;
      }

      set({ isLoadingMore: true });

      // Calculate range for next batch
      const from = invoicesPage * 50;
      const to = from + 49;

      // Load next batch of 50 invoices with joins
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select(`
          *,
          client:clients(*),
          invoice_items(*), payments(*)
        `)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (invoicesError) {
        console.error("Error loading more invoices:", invoicesError);
        set({ isLoadingMore: false });
        throw new Error(`Failed to load more invoices: ${invoicesError.message}`);
      }

      if (!invoicesData || invoicesData.length === 0) {
        set({ allInvoicesLoaded: true, isLoadingMore: false });
        console.log("No more invoices to load");
        return;
      }

      // Transform the data
      const newInvoices: Invoice[] = invoicesData
        .map((invoice) => {
          if (!invoice.client) {
            console.warn(`Client not found for invoice ${invoice.id}`);
            return null;
          }

          const payments = (invoice.payments || []).map((p: any) => ({
            id: p.id,
            amount: parseFloat(p.amount),
            method: p.method,
            paidByName: p.paid_by_name || undefined,
            paidByPhone: p.paid_by_phone || undefined,
            createdAt: p.created_at,
          }));
          const invoiceTotal = parseFloat(invoice.total);
          const amountPaid = payments.reduce((sum: number, p: any) => sum + p.amount, 0);

          return {
            id: invoice.id,
            client: {
              id: invoice.client.id,
              name: invoice.client.name,
              phone: invoice.client.phone,
              address: invoice.client.address || "",
              visitCount: invoice.client.visit_count || 0,
              rewardClaimed: invoice.client.reward_claimed || false,
              lastVisit: invoice.client.last_visit || new Date().toISOString(),
              createdAt: invoice.client.created_at,
              updatedAt: invoice.client.updated_at,
            },
            items: (invoice.invoice_items || []).map((item: any) => ({
              id: item.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: parseFloat(item.unit_price),
              totalPrice: parseFloat(item.total_price),
            })),
            total: parseFloat(invoice.total),
            paymentMethod: invoice.payment_method,
            paid: invoice.paid ?? false,
            payments,
            amountPaid,
            balanceDue: Math.max(0, invoiceTotal - amountPaid),
            status: invoice.status,
            pickupDate: invoice.pickup_date || undefined,
            pickupTime: invoice.pickup_time || undefined,
            notes: invoice.notes || undefined,
            section: invoice.section || undefined,
            hangersBrought: invoice.hangers_brought ?? undefined,
            hangersCount: invoice.hangers_count ?? undefined,
            coversBrought: invoice.covers_brought ?? undefined,
            coversCount: invoice.covers_count ?? undefined,
            createdByName: invoice.created_by_name || undefined,
            createdByPhone: invoice.created_by_phone || undefined,
            completedByName: invoice.completed_by_name || undefined,
            completedByPhone: invoice.completed_by_phone || undefined,
            completedAt: invoice.completed_at || undefined,
            paidByName: invoice.paid_by_name || undefined,
            paidByPhone: invoice.paid_by_phone || undefined,
            createdAt: invoice.created_at,
            updatedAt: invoice.updated_at,
          };
        })
        .filter(Boolean) as Invoice[];

      // Check if we've loaded all invoices
      const allLoaded = invoicesData.length < 50;

      // Append new invoices to existing ones, deduping by id — a search
      // (see searchInvoicesDb) can merge older invoices into this array
      // out of band, so pagination catching up to one of those must not
      // create a duplicate entry.
      set((state) => {
        const byId = new Map(state.invoices.map((inv) => [inv.id, inv]));
        for (const inv of newInvoices) byId.set(inv.id, inv);
        return {
          invoices: Array.from(byId.values()),
          invoicesPage: state.invoicesPage + 1,
          allInvoicesLoaded: allLoaded,
          isLoadingMore: false,
        };
      });

      console.log(`Loaded ${newInvoices.length} more invoices (page ${invoicesPage + 1})`);
    } catch (error: any) {
      console.error("Error loading more invoices:", error);
      set({ isLoadingMore: false });
      throw error;
    }
  },

  searchInvoicesDb: async (query: string) => {
    const q = query.trim();
    if (!q) return [];

    const selectJoined = `
          *,
          client:clients(*),
          invoice_items(*), payments(*)
        `;

    const pageSize = 1000;

    const fetchPaged = async (build: (base: any) => any) => {
      const allRows: any[] = [];
      let page = 0;

      for (;;) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const base = supabase
          .from("invoices")
          .select(selectJoined)
          .order("created_at", { ascending: false })
          .range(from, to);

        const { data, error } = await build(base);
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;

        allRows.push(...data);
        if (data.length < pageSize) break;
        page++;
      }

      return allRows;
    };

    const { data: matchingClients, error: clientsError } = await supabase
      .from("clients")
      .select("id")
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`);

    if (clientsError) {
      throw new Error(clientsError.message);
    }

    const clientIds = (matchingClients || []).map((c: any) => c.id);

    const rowsById = await fetchPaged((base) => base.ilike("id", `%${q}%`));

    const rowsByClient =
      clientIds.length > 0
        ? await fetchPaged((base) => base.in("client_id", clientIds))
        : [];

    const merged = new Map<string, any>();
    [...rowsById, ...rowsByClient].forEach((row) => {
      if (row?.id) merged.set(row.id, row);
    });

    const invoices: Invoice[] = Array.from(merged.values())
      .map((invoice: any) => {
        if (!invoice.client) return null;
        const payments = (invoice.payments || []).map((p: any) => ({
          id: p.id,
          amount: parseFloat(p.amount),
          method: p.method,
          paidByName: p.paid_by_name || undefined,
          paidByPhone: p.paid_by_phone || undefined,
          createdAt: p.created_at,
        }));
        const invoiceTotal = parseFloat(invoice.total);
        const amountPaid = payments.reduce((sum: number, p: any) => sum + p.amount, 0);

        return {
          id: invoice.id,
          client: {
            id: invoice.client.id,
            name: invoice.client.name,
            phone: invoice.client.phone,
            address: invoice.client.address || "",
            visitCount: invoice.client.visit_count || 0,
            rewardClaimed: invoice.client.reward_claimed || false,
            lastVisit: invoice.client.last_visit || new Date().toISOString(),
            createdAt: invoice.client.created_at,
            updatedAt: invoice.client.updated_at,
          },
          items: (invoice.invoice_items || []).map((item: any) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unit_price),
            totalPrice: parseFloat(item.total_price),
          })),
          total: parseFloat(invoice.total),
          paymentMethod: invoice.payment_method,
          paid: invoice.paid ?? false,
          payments,
          amountPaid,
          balanceDue: Math.max(0, invoiceTotal - amountPaid),
          status: invoice.status,
          pickupDate: invoice.pickup_date || undefined,
          pickupTime: invoice.pickup_time || undefined,
          notes: invoice.notes || undefined,
          section: invoice.section || undefined,
          hangersBrought: invoice.hangers_brought ?? undefined,
          hangersCount: invoice.hangers_count ?? undefined,
          coversBrought: invoice.covers_brought ?? undefined,
          coversCount: invoice.covers_count ?? undefined,
          createdByName: invoice.created_by_name || undefined,
          createdByPhone: invoice.created_by_phone || undefined,
          completedByName: invoice.completed_by_name || undefined,
          completedByPhone: invoice.completed_by_phone || undefined,
          completedAt: invoice.completed_at || undefined,
          paidByName: invoice.paid_by_name || undefined,
          paidByPhone: invoice.paid_by_phone || undefined,
          createdAt: invoice.created_at,
          updatedAt: invoice.updated_at,
        };
      })
      .filter(Boolean) as Invoice[];
      
    invoices.sort(
      (a: Invoice, b: Invoice) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Merge results into the main invoices cache too — otherwise an older
    // invoice that's only reachable via search (not in the paginated
    // list) would silently fail to be found by id everywhere else in the
    // app: editing it, marking it paid, changing its status, etc.
    set((state) => {
      const byId = new Map(state.invoices.map((inv) => [inv.id, inv]));
      for (const inv of invoices) byId.set(inv.id, inv);
      return { invoices: Array.from(byId.values()) };
    });

    return invoices;
  },

  fetchRecentCompleted: async (filter: "completed" | "paid", limit: number) => {
    try {
      // updated_at is bumped by a DB trigger on ANY change to the row —
      // including unrelated ones like a client merge reassigning
      // client_id — so it can't be trusted as "when this was
      // completed/paid". For "completed" we now have a precise
      // completed_at column to order by instead. For "paid" there's no
      // single trustworthy invoice-level column (it's the max of the
      // payments table), so fetch a wider candidate pool by updated_at
      // and re-rank by actual payment recency below.
      let query = supabase
        .from("invoices")
        .select(`*, client:clients(*), invoice_items(*), payments(*)`);

      if (filter === "completed") {
        // completed_at only exists once scripts/add-completed-at.sql has
        // been run — fall back to updated_at (the old, less precise
        // behavior) rather than a hard 400 error until then.
        const hasCompletedAtCol = await checkCompletedAtColumn();
        query = query.eq("status", "completed");
        query = hasCompletedAtCol
          ? query.order("completed_at", { ascending: false, nullsFirst: false }).limit(limit)
          : query.order("updated_at", { ascending: false }).limit(limit);
      } else {
        const candidatePoolSize = Math.min(Math.max(limit * 4, 200), 1000);
        query = query
          .eq("paid", true)
          .order("updated_at", { ascending: false })
          .limit(candidatePoolSize);
      }

      const { data, error } = await query;

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return [];

      const invoices = data
        .map((invoice: any) => {
          if (!invoice.client) return null;
          const payments = (invoice.payments || []).map((p: any) => ({
            id: p.id,
            amount: parseFloat(p.amount),
            method: p.method,
            paidByName: p.paid_by_name || undefined,
            paidByPhone: p.paid_by_phone || undefined,
            createdAt: p.created_at,
          }));
          const invoiceTotal = parseFloat(invoice.total);
          const amountPaid = payments.reduce((sum: number, p: any) => sum + p.amount, 0);

          return {
            id: invoice.id,
            client: {
              id: invoice.client.id,
              name: invoice.client.name,
              phone: invoice.client.phone,
              address: invoice.client.address || "",
              visitCount: invoice.client.visit_count || 0,
              rewardClaimed: invoice.client.reward_claimed || false,
              lastVisit: invoice.client.last_visit || new Date().toISOString(),
              createdAt: invoice.client.created_at,
              updatedAt: invoice.client.updated_at,
            },
            items: (invoice.invoice_items || []).map((item: any) => ({
              id: item.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: parseFloat(item.unit_price),
              totalPrice: parseFloat(item.total_price),
            })),
            total: parseFloat(invoice.total),
            paymentMethod: invoice.payment_method,
            paid: invoice.paid ?? false,
            payments,
            amountPaid,
            balanceDue: Math.max(0, invoiceTotal - amountPaid),
            status: invoice.status,
            pickupDate: invoice.pickup_date || undefined,
            pickupTime: invoice.pickup_time || undefined,
            notes: invoice.notes || undefined,
            section: invoice.section || undefined,
            hangersBrought: invoice.hangers_brought ?? undefined,
            hangersCount: invoice.hangers_count ?? undefined,
            coversBrought: invoice.covers_brought ?? undefined,
            coversCount: invoice.covers_count ?? undefined,
            createdByName: invoice.created_by_name || undefined,
            createdByPhone: invoice.created_by_phone || undefined,
            completedByName: invoice.completed_by_name || undefined,
            completedByPhone: invoice.completed_by_phone || undefined,
            completedAt: invoice.completed_at || undefined,
            paidByName: invoice.paid_by_name || undefined,
            paidByPhone: invoice.paid_by_phone || undefined,
            createdAt: invoice.created_at,
            updatedAt: invoice.updated_at,
          };
        })
        .filter(Boolean) as Invoice[];

      // For "paid", the candidate pool was ordered by the untrustworthy
      // updated_at — re-rank by each invoice's actual latest payment
      // timestamp (falls back to updatedAt only if it somehow has none)
      // and trim down to what was actually asked for.
      const rankedInvoices =
        filter === "paid"
          ? [...invoices]
              .sort((a, b) => {
                const latest = (inv: Invoice) =>
                  (inv.payments || []).length > 0
                    ? Math.max(...inv.payments!.map((p) => new Date(p.createdAt).getTime()))
                    : new Date(inv.updatedAt).getTime();
                return latest(b) - latest(a);
              })
              .slice(0, limit)
          : invoices;

      // Enrich with actor names from audit_logs — works immediately with no migration
      const invoiceIds = rankedInvoices.map((inv) => inv.id);
      const { data: logs } = await supabase
        .from("audit_logs")
        .select("entity_id, actor_name, action, changes")
        .in("entity_id", invoiceIds)
        .in("action", ["status_update", "payment_update"])
        .order("created_at", { ascending: false });

      const completedActorMap = new Map<string, string>();
      const paidActorMap = new Map<string, string>();

      for (const log of logs || []) {
        if (!log.entity_id || !log.actor_name) continue;
        const changes = log.changes as any;
        if (
          log.action === "status_update" &&
          changes?.status === "completed" &&
          !completedActorMap.has(log.entity_id)
        ) {
          completedActorMap.set(log.entity_id, log.actor_name);
        }
        if (
          log.action === "payment_update" &&
          changes?.paid === true &&
          !paidActorMap.has(log.entity_id)
        ) {
          paidActorMap.set(log.entity_id, log.actor_name);
        }
      }

      return rankedInvoices.map((inv) => ({
        ...inv,
        completedByName: completedActorMap.get(inv.id) || inv.completedByName,
        // For paid invoices: prefer payment_update log → fall back to whoever
        // completed the invoice (same actor in most cases for historical data).
        paidByName:
          paidActorMap.get(inv.id) ||
          completedActorMap.get(inv.id) ||
          inv.paidByName,
      }));
    } catch (error: any) {
      console.error("Error fetching recent completed:", error);
      return [];
    }
  },

  fetchInvoicesForDateRange: async (fromIso: string, toIso: string) => {
    const selectJoined = `
          *,
          client:clients(*),
          invoice_items(*), payments(*)
        `;

    const pageSize = 1000;
    const allRows: any[] = [];
    let page = 0;

    for (;;) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("invoices")
        .select(selectJoined)
        .order("created_at", { ascending: false })
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .range(from, to);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      allRows.push(...data);
      if (data.length < pageSize) break;
      page++;
    }

    const invoices: Invoice[] = allRows
      .map((invoice: any) => {
        if (!invoice.client) return null;
        const payments = (invoice.payments || []).map((p: any) => ({
          id: p.id,
          amount: parseFloat(p.amount),
          method: p.method,
          paidByName: p.paid_by_name || undefined,
          paidByPhone: p.paid_by_phone || undefined,
          createdAt: p.created_at,
        }));
        const invoiceTotal = parseFloat(invoice.total);
        const amountPaid = payments.reduce((sum: number, p: any) => sum + p.amount, 0);

        return {
          id: invoice.id,
          client: {
            id: invoice.client.id,
            name: invoice.client.name,
            phone: invoice.client.phone,
            address: invoice.client.address || "",
            visitCount: invoice.client.visit_count || 0,
            rewardClaimed: invoice.client.reward_claimed || false,
            lastVisit: invoice.client.last_visit || new Date().toISOString(),
            createdAt: invoice.client.created_at,
            updatedAt: invoice.client.updated_at,
          },
          items: (invoice.invoice_items || []).map((item: any) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unit_price),
            totalPrice: parseFloat(item.total_price),
          })),
          total: parseFloat(invoice.total),
          paymentMethod: invoice.payment_method,
          paid: invoice.paid ?? false,
          payments,
          amountPaid,
          balanceDue: Math.max(0, invoiceTotal - amountPaid),
          status: invoice.status,
          pickupDate: invoice.pickup_date || undefined,
          pickupTime: invoice.pickup_time || undefined,
          notes: invoice.notes || undefined,
          section: invoice.section || undefined,
          hangersBrought: invoice.hangers_brought ?? undefined,
          hangersCount: invoice.hangers_count ?? undefined,
          coversBrought: invoice.covers_brought ?? undefined,
          coversCount: invoice.covers_count ?? undefined,
          createdByName: invoice.created_by_name || undefined,
          createdByPhone: invoice.created_by_phone || undefined,
          completedByName: invoice.completed_by_name || undefined,
          completedByPhone: invoice.completed_by_phone || undefined,
          completedAt: invoice.completed_at || undefined,
          paidByName: invoice.paid_by_name || undefined,
          paidByPhone: invoice.paid_by_phone || undefined,
          createdAt: invoice.created_at,
          updatedAt: invoice.updated_at,
        };
      })
      .filter(Boolean) as Invoice[];

    return invoices;
  },

  addInvoice: async (invoiceData) => {
    assertOnline(get);
    try {
      console.log("Starting invoice creation process...");
      set({ loading: true, error: null });

      // Validate invoice data
      if (!invoiceData.id) {
        throw new Error("Invoice ID is required");
      }
      if (!invoiceData.client?.id) {
        throw new Error("Client ID is required");
      }
      if (!invoiceData.items || invoiceData.items.length === 0) {
        throw new Error("Invoice items are required");
      }

      console.log("Inserting invoice:", {
        id: invoiceData.id,
        client_id: invoiceData.client.id,
        total: invoiceData.total,
        payment_method: invoiceData.paymentMethod,
        status: invoiceData.status,
        pickup_date: invoiceData.pickupDate || null,
        pickup_time: invoiceData.pickupTime || null,
        notes: invoiceData.notes || null,
        section: invoiceData.section || null,
        created_by_name: get().currentUserName || null,
        created_by_phone: get().currentUserPhone || null,
      });

      // Payment(s) recorded at creation — either explicit split/partial
      // payments from the form, or (if none given) the old single-method
      // "paid in full" behavior for paymentMethod !== UNPAID.
      const initialPayments = (invoiceData as any).initialPayments as
        | { amount: number; method: string }[]
        | undefined;
      const totalPaidAtCreation =
        initialPayments && initialPayments.length > 0
          ? initialPayments.reduce((sum, p) => sum + p.amount, 0)
          : invoiceData.paymentMethod !== "UNPAID"
          ? invoiceData.total
          : 0;
      const isFullyPaidAtCreation =
        invoiceData.total > 0
          ? totalPaidAtCreation >= invoiceData.total - 0.01
          : totalPaidAtCreation > 0;

      // Insert invoice. Invoice ids are date+random, so a same-day
      // collision is very unlikely but not impossible — if Postgres
      // rejects it as a duplicate key, regenerate a fresh id and retry
      // instead of failing the whole save.
      let invoiceResult: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase
          .from("invoices")
          .insert({
            id: invoiceData.id,
            client_id: invoiceData.client.id,
            total: invoiceData.total,
            payment_method: invoiceData.paymentMethod,
            paid: isFullyPaidAtCreation,
            status: invoiceData.status,
            pickup_date: invoiceData.pickupDate || null,
            pickup_time: invoiceData.pickupTime || null,
            notes: invoiceData.notes || null,
            section: invoiceData.section || null,
            hangers_brought: invoiceData.hangersBrought ?? null,
            hangers_count: invoiceData.hangersBrought
              ? invoiceData.hangersCount ?? 0
              : null,
            covers_brought: invoiceData.coversBrought ?? null,
            covers_count: invoiceData.coversBrought
              ? invoiceData.coversCount ?? 0
              : null,
            created_by_name: get().currentUserName || null,
            created_by_phone: get().currentUserPhone || null,
            // Allow overriding created_at when provided
            ...(invoiceData.createdAt
              ? { created_at: invoiceData.createdAt }
              : {}),
          })
          .select()
          .single();

        if (!error) {
          invoiceResult = data;
          break;
        }

        const isDuplicateId = error.code === "23505";
        if (isDuplicateId && attempt < 2) {
          console.warn(
            `Invoice id ${invoiceData.id} collided, regenerating and retrying...`
          );
          invoiceData.id = generateInvoiceId();
          continue;
        }

        console.error("Invoice insert error:", error);
        throw new Error(`Failed to create invoice: ${error.message}`);
      }

      console.log("Invoice inserted successfully:", invoiceResult);

      // Insert invoice items
      if (invoiceData.items.length > 0) {
        const itemsToInsert = invoiceData.items.map((item) => ({
          invoice_id: invoiceData.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
        }));

        console.log("Inserting invoice items:", itemsToInsert);

        const { error: itemsError } = await supabase
          .from("invoice_items")
          .insert(itemsToInsert);

        if (itemsError) {
          console.error("Invoice items insert error:", itemsError);
          // Try to rollback the invoice
          await supabase.from("invoices").delete().eq("id", invoiceData.id);
          throw new Error(
            `Failed to create invoice items: ${itemsError.message}`
          );
        }

        console.log("Invoice items inserted successfully");
      }

      // Record whatever was actually paid at creation — split across
      // methods and/or only partial — so amountPaid/balanceDue are right
      // from the start, not just the `paid` flag.
      if (initialPayments && initialPayments.length > 0) {
        const rows = initialPayments
          .filter((p) => p.amount > 0)
          .map((p) => ({
            invoice_id: invoiceData.id,
            amount: p.amount,
            method: p.method,
            paid_by_name: get().currentUserName || null,
            paid_by_phone: get().currentUserPhone || null,
          }));
        if (rows.length > 0) {
          const { error: paymentError } = await supabase.from("payments").insert(rows);
          if (paymentError) {
            console.warn("Failed to record initial payment(s):", paymentError);
          }
        }
      } else if (invoiceData.paymentMethod !== "UNPAID" && invoiceData.total > 0) {
        // No explicit split given — fall back to "paid in full" for the
        // chosen method, same as before this feature existed.
        const { error: paymentError } = await supabase.from("payments").insert({
          invoice_id: invoiceData.id,
          amount: invoiceData.total,
          method: invoiceData.paymentMethod,
          paid_by_name: get().currentUserName || null,
          paid_by_phone: get().currentUserPhone || null,
        });
        if (paymentError) {
          console.warn("Failed to record initial payment:", paymentError);
        }
      }

      // Update client visit count
      console.log("Updating client visit count...");
      const { error: clientUpdateError } = await supabase
        .from("clients")
        .update({
          visit_count: invoiceData.client.visitCount + 1,
          last_visit: new Date().toISOString(),
        })
        .eq("id", invoiceData.client.id);

      if (clientUpdateError) {
        console.warn("Failed to update client visit count:", clientUpdateError);
      }

      // Reload data
      console.log("Reloading data...");
      await get().loadInvoices();
      await get().loadClients();

      set({ loading: false });

      console.log("Invoice creation completed successfully");
      // audit log
      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "create",
          entity_type: "invoice",
          entity_id: invoiceData.id,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: { total: invoiceData.total, status: invoiceData.status },
        });
      } catch {}

      toast({
        title: "Invoice created successfully!",
        description: `Invoice ${invoiceData.id} has been created.`,
      });
    } catch (error: any) {
      console.error("Error adding invoice:", error);
      const errorMessage = error.message || "Failed to add invoice";
      set({ error: errorMessage, loading: false });
      toast({
        title: "Error adding invoice",
        description: errorMessage,
        variant: "destructive",
      });
      throw error; // Re-throw to be caught by the form
    }
  },

  updateInvoice: async (id, updates) => {
    assertOnline(get);
    try {
      set({ loading: true, error: null });

      // Update invoice
      const updateData: any = {};
      if (updates.client?.id) updateData.client_id = updates.client.id;
      if (updates.total !== undefined) updateData.total = updates.total;
      if (updates.paymentMethod)
        updateData.payment_method = updates.paymentMethod;
      if (updates.status) updateData.status = updates.status;
      if (updates.pickupDate !== undefined)
        updateData.pickup_date = updates.pickupDate || null;
      if (updates.pickupTime !== undefined)
        updateData.pickup_time = updates.pickupTime || null;
      if (updates.notes !== undefined) updateData.notes = updates.notes || null;
      if (updates.section !== undefined) updateData.section = updates.section || null;
      if (updates.hangersBrought !== undefined) {
        updateData.hangers_brought = updates.hangersBrought;
        updateData.hangers_count = updates.hangersBrought
          ? updates.hangersCount ?? 0
          : null;
      }
      if (updates.coversBrought !== undefined) {
        updateData.covers_brought = updates.coversBrought;
        updateData.covers_count = updates.coversBrought
          ? updates.coversCount ?? 0
          : null;
      }
      if ((updates as any).createdAt)
        updateData.created_at = (updates as any).createdAt;

      const { error: invoiceError } = await supabase
        .from("invoices")
        .update(updateData)
        .eq("id", id);

      if (invoiceError) {
        throw new Error(`Failed to update invoice: ${invoiceError.message}`);
      }

      // If items are updated, delete old items and insert new ones
      if (updates.items) {
        // Delete existing items
        const { error: deleteError } = await supabase
          .from("invoice_items")
          .delete()
          .eq("invoice_id", id);

        if (deleteError) {
          throw new Error(
            `Failed to update invoice items: ${deleteError.message}`
          );
        }

        // Insert new items
        if (updates.items.length > 0) {
          const itemsToInsert = updates.items.map((item) => ({
            invoice_id: id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
          }));

          const { error: itemsError } = await supabase
            .from("invoice_items")
            .insert(itemsToInsert);

          if (itemsError) {
            throw new Error(
              `Failed to update invoice items: ${itemsError.message}`
            );
          }
        }
      }

      // Reload data
      await get().loadInvoices();
      set({ loading: false });

      // audit log
      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "update",
          entity_type: "invoice",
          entity_id: id,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: updates as any,
        });
      } catch {}

      toast({
        title: "Invoice updated successfully!",
      });
    } catch (error: any) {
      console.error("Error updating invoice:", error);
      const errorMessage = error.message || "Failed to update invoice";
      set({ error: errorMessage, loading: false });
      toast({
        title: "Error updating invoice",
        description: errorMessage,
        variant: "destructive",
      });
    }
  },

  deleteInvoice: async (id) => {
    assertOnline(get);
    try {
      set({ loading: true, error: null });

      const { error } = await supabase.from("invoices").delete().eq("id", id);

      if (error) {
        throw new Error(`Failed to delete invoice: ${error.message}`);
      }

      set((state) => ({
        invoices: state.invoices.filter((invoice) => invoice.id !== id),
        loading: false,
      }));

      // audit log
      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "delete",
          entity_type: "invoice",
          entity_id: id,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
        });
      } catch {}

      toast({
        title: "Invoice deleted successfully!",
      });
    } catch (error: any) {
      console.error("Error deleting invoice:", error);
      const errorMessage = error.message || "Failed to delete invoice";
      set({ error: errorMessage, loading: false });
      toast({
        title: "Error deleting invoice",
        description: errorMessage,
        variant: "destructive",
      });
    }
  },

  updateInvoiceSection: async (id, section) => {
    assertOnline(get);
    try {
      set({ loading: true, error: null });

      const { error: invoiceError } = await supabase
        .from("invoices")
        .update({ section })
        .eq("id", id);

      if (invoiceError) {
        throw new Error(`Failed to update section: ${invoiceError.message}`);
      }

      set((state) => ({
        invoices: state.invoices.map((inv) =>
          inv.id === id ? { ...inv, section: section || undefined } : inv
        ),
        loading: false,
      }));

      // audit log
      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "update_section",
          entity_type: "invoice",
          entity_id: id,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: { section },
        });
      } catch {}

      toast({
        title: "Section updated successfully!",
      });
    } catch (error: any) {
      console.error("Error updating section:", error);
      const errorMessage = error.message || "Failed to update section";
      set({ error: errorMessage, loading: false });
      toast({
        title: "Error updating section",
        description: errorMessage,
        variant: "destructive",
      });
    }
  },

  getPickupNotifications: () => {
    const now = new Date();
    const currentDate = getLocalDateString(now); // YYYY-MM-DD, local calendar day
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeString = `${currentHour
      .toString()
      .padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;

    return get().invoices.filter((invoice) => {
      if (
        !invoice.pickupDate ||
        !invoice.pickupTime ||
        invoice.status === "completed"
      ) {
        return false;
      }

      // Check if pickup date is today
      const isToday = invoice.pickupDate === currentDate;

      // Check if pickup time matches current time (exact match)
      const pickupTime = invoice.pickupTime.substring(0, 5); // Get HH:MM format
      const isTimeMatch = pickupTime === currentTimeString;

      // Show notification only when it's exactly the pickup date and time
      return isToday && isTimeMatch;
    });
  },

  loadData: async () => {
    try {
      await Promise.all([get().loadClients(), get().loadInvoices()]);
      set({ lastSyncedAt: new Date().toISOString(), isOnline: true });
    } catch (error: any) {
      console.error("Error loading data:", error);
      // A failed sync while the browser still thinks it's online usually
      // means the connection is actually the problem — reflect that in
      // the UI too, not just in this one call's error state.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        set({ isOnline: false });
      }
      throw error;
    }
  },

  subscribeToRealTimeUpdates: () => {
    const channel = supabase
      .channel("invoice-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
        },
        (payload) => {
          console.log("Real-time invoice update:", payload);
          // Reload invoices when changes occur
          get().loadInvoices();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clients",
        },
        (payload) => {
          console.log("Real-time client update:", payload);
          // Reload clients when changes occur
          get().loadClients();
        }
      )
      .subscribe();

    set({ realtimeChannel: channel });
  },

  unsubscribeFromRealTimeUpdates: () => {
    const { realtimeChannel } = get();
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      set({ realtimeChannel: null });
    }
  },

  updateInvoiceStatus: async (id, status) => {
    assertOnline(get);
    // Never let an invoice be marked completed without a confirmed
    // payment — this is the single choke point every "mark completed"
    // action in the app goes through, so the rule holds everywhere.
    if (status === "completed") {
      const invoice = get().invoices.find((inv) => inv.id === id);
      // With split/partial payments, `paid` alone isn't precise enough —
      // a deposit could be recorded (paid=false, but not "unpaid" either).
      // The real requirement is the balance being fully settled.
      const stillOwes = invoice
        ? invoice.balanceDue !== undefined
          ? invoice.balanceDue > 0
          : !invoice.paid
        : false;
      if (stillOwes) {
        const message = invoice?.balanceDue
          ? `Cannot mark this invoice as completed — a balance of ${invoice.balanceDue.toLocaleString()} is still unpaid.`
          : "Cannot mark this invoice as completed — payment hasn't been confirmed yet. Mark it as paid first.";
        toast({
          title: "Payment not confirmed",
          description: message,
          variant: "destructive",
        });
        throw new Error(message);
      }
    }

    try {
      set({ loading: true, error: null });

      const { currentUserName, currentUserPhone } = get();
      const isCompleting = status === "completed";
      const hasActorCols = await checkActorColumns();
      const hasCompletedAtCol = await checkCompletedAtColumn();
      const completedAtIso = new Date().toISOString();

      const statusPayload: Record<string, any> = {
        status,
        updated_at: new Date().toISOString(),
        ...(hasActorCols && {
          completed_by_name: isCompleting ? (currentUserName || null) : null,
          completed_by_phone: isCompleting ? (currentUserPhone || null) : null,
        }),
        // Precise "when this became completed" — unlike updated_at, a DB
        // trigger doesn't bump this on unrelated edits, so date-grouped
        // views (Recent Completed) can trust it.
        ...(hasCompletedAtCol && {
          completed_at: isCompleting ? completedAtIso : null,
        }),
      };

      const { error } = await supabase.from("invoices").update(statusPayload).eq("id", id);

      if (error) {
        throw new Error(`Failed to update invoice status: ${error.message}`);
      }

      // Update local state immediately for better UX
      set((state) => ({
        invoices: state.invoices.map((invoice) =>
          invoice.id === id
            ? {
                ...invoice,
                status,
                updatedAt: new Date().toISOString(),
                completedByName: isCompleting ? (currentUserName || undefined) : undefined,
                completedByPhone: isCompleting ? (currentUserPhone || undefined) : undefined,
                completedAt: isCompleting ? completedAtIso : undefined,
              }
            : invoice
        ),
        loading: false,
      }));

      // audit log
      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "status_update",
          entity_type: "invoice",
          entity_id: id,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: { status },
        });
      } catch {}

      toast({
        title: "Status updated successfully!",
        description: `Invoice ${id} marked as ${status}`,
      });
    } catch (error: any) {
      console.error("Error updating invoice status:", error);
      const errorMessage = error.message || "Failed to update status";
      set({ error: errorMessage, loading: false });
      toast({
        title: "Error updating status",
        description: errorMessage,
        variant: "destructive",
      });
    }
  },

  // Quick full-paid/unpaid toggle (the split/partial "Record Payment"
  // flow is addPayment). Kept reconciled with the payments ledger so the
  // two never disagree: marking paid records one payment for whatever
  // balance remains; marking unpaid reverses that by clearing payments.
  updateInvoicePaid: async (id, paid) => {
    assertOnline(get);
    const { currentUserName, currentUserPhone } = get();
    const previous = get().invoices.find((inv) => inv.id === id);

    if (paid) {
      const balance = previous?.balanceDue ?? previous?.total ?? 0;
      if (balance > 0) {
        const method =
          previous?.paymentMethod && previous.paymentMethod !== "UNPAID"
            ? previous.paymentMethod
            : "CASH";
        await get().addPayment(id, balance, method);
      }
      return;
    }

    // Marking unpaid — nothing was actually received after all, so clear
    // whatever payments were recorded rather than leaving them
    // contradicting the flag.
    try {
      const { error: deleteError } = await supabase
        .from("payments")
        .delete()
        .eq("invoice_id", id);
      if (deleteError) throw new Error(deleteError.message);

      const { error } = await supabase
        .from("invoices")
        .update({ paid: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`Failed to update paid flag: ${error.message}`);

      set((state) => ({
        invoices: state.invoices.map((inv) =>
          inv.id === id
            ? {
                ...inv,
                paid: false,
                payments: [],
                amountPaid: 0,
                balanceDue: inv.total,
                updatedAt: new Date().toISOString(),
              }
            : inv
        ),
      }));

      try {
        await supabase.from("audit_logs").insert({
          action: "payment_update",
          entity_type: "invoice",
          entity_id: id,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: { paid: false },
        });
      } catch {}

      toast({ title: "Marked as UNPAID" });
    } catch (error: any) {
      console.error("Error updating paid flag:", error);
      set({ error: error.message });
      toast({
        title: "Error updating paid flag",
        description: error.message,
        variant: "destructive",
      });
    }
  },

  // Changes the label of how an invoice is being paid. Picking a real
  // method while a balance remains records a payment for that balance
  // (same as updateInvoicePaid(true)); picking UNPAID just relabels it
  // without touching any payments already on record.
  updateInvoicePaymentMethod: async (id, method) => {
    assertOnline(get);
    const invoice = get().invoices.find((inv) => inv.id === id);
    const balance = invoice?.balanceDue ?? invoice?.total ?? 0;

    if (method !== "UNPAID" && balance > 0) {
      await get().addPayment(id, balance, method);
      return;
    }

    try {
      const { error } = await supabase
        .from("invoices")
        .update({ payment_method: method, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error)
        throw new Error(`Failed to update payment method: ${error.message}`);

      set((state) => ({
        invoices: state.invoices.map((inv) =>
          inv.id === id ? { ...inv, paymentMethod: method } : inv
        ),
      }));

      toast({ title: "Payment method updated" });
    } catch (error: any) {
      set({ error: error.message });
      toast({
        title: "Error updating payment method",
        description: error.message,
        variant: "destructive",
      });
    }
  },

  addPayment: async (invoiceId, amount, method) => {
    assertOnline(get);
    if (!(amount > 0)) {
      toast({ title: "Enter a payment amount greater than zero", variant: "destructive" });
      throw new Error("Payment amount must be greater than zero");
    }

    const invoice = get().invoices.find((inv) => inv.id === invoiceId);
    const currentBalance = invoice
      ? invoice.balanceDue ?? (invoice.paid ? 0 : invoice.total)
      : undefined;
    // Allow a tiny rounding cushion, but not a materially larger payment
    // than what's actually owed — this is what makes "split payment"
    // trustworthy: the numbers always add up to the invoice total.
    if (currentBalance !== undefined && amount > currentBalance + 1) {
      toast({
        title: "Amount exceeds balance due",
        description: `Only ${currentBalance.toLocaleString()} is still owed on this invoice.`,
        variant: "destructive",
      });
      throw new Error("Payment amount exceeds balance due");
    }

    const { currentUserName, currentUserPhone } = get();

    try {
      const { data, error } = await supabase
        .from("payments")
        .insert({
          invoice_id: invoiceId,
          amount,
          method,
          paid_by_name: currentUserName || null,
          paid_by_phone: currentUserPhone || null,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to record payment: ${error.message}`);

      const newPayment = {
        id: data.id,
        amount: parseFloat(data.amount),
        method: data.method,
        paidByName: data.paid_by_name || undefined,
        paidByPhone: data.paid_by_phone || undefined,
        createdAt: data.created_at,
      };

      set((state) => ({
        invoices: state.invoices.map((inv) => {
          if (inv.id !== invoiceId) return inv;
          const payments = [...(inv.payments || []), newPayment];
          const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
          const balanceDue = Math.max(0, inv.total - amountPaid);
          return {
            ...inv,
            payments,
            amountPaid,
            balanceDue,
            paid: balanceDue <= 0,
            paymentMethod: method,
            updatedAt: new Date().toISOString(),
          };
        }),
      }));

      try {
        await supabase.from("invoices").update({
          paid: (currentBalance ?? amount) - amount <= 0,
          payment_method: method,
          updated_at: new Date().toISOString(),
        }).eq("id", invoiceId);
      } catch {}

      try {
        await supabase.from("audit_logs").insert({
          action: "payment_recorded",
          entity_type: "invoice",
          entity_id: invoiceId,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: { amount, method },
        });
      } catch {}

      toast({ title: `Payment of ${amount.toLocaleString()} recorded` });
    } catch (error: any) {
      toast({
        title: "Error recording payment",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  },

  addPayments: async (invoiceId, lines) => {
    assertOnline(get);
    const valid = lines.filter((l) => l.amount > 0);
    if (valid.length === 0) {
      toast({ title: "Enter at least one payment amount greater than zero", variant: "destructive" });
      throw new Error("No valid payment lines");
    }

    const invoice = get().invoices.find((inv) => inv.id === invoiceId);
    const currentBalance = invoice
      ? invoice.balanceDue ?? (invoice.paid ? 0 : invoice.total)
      : undefined;
    const totalEntered = valid.reduce((sum, l) => sum + l.amount, 0);
    if (currentBalance !== undefined && totalEntered > currentBalance + 1) {
      toast({
        title: "Amount exceeds balance due",
        description: `Only ${currentBalance.toLocaleString()} is still owed on this invoice.`,
        variant: "destructive",
      });
      throw new Error("Payment amount exceeds balance due");
    }

    const { currentUserName, currentUserPhone } = get();

    try {
      const { data, error } = await supabase
        .from("payments")
        .insert(
          valid.map((l) => ({
            invoice_id: invoiceId,
            amount: l.amount,
            method: l.method,
            paid_by_name: currentUserName || null,
            paid_by_phone: currentUserPhone || null,
          }))
        )
        .select();

      if (error) throw new Error(`Failed to record payment(s): ${error.message}`);

      const newPayments = (data || []).map((p: any) => ({
        id: p.id,
        amount: parseFloat(p.amount),
        method: p.method,
        paidByName: p.paid_by_name || undefined,
        paidByPhone: p.paid_by_phone || undefined,
        createdAt: p.created_at,
      }));

      const lastMethod = valid[valid.length - 1].method;

      set((state) => ({
        invoices: state.invoices.map((inv) => {
          if (inv.id !== invoiceId) return inv;
          const payments = [...(inv.payments || []), ...newPayments];
          const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
          const balanceDue = Math.max(0, inv.total - amountPaid);
          return {
            ...inv,
            payments,
            amountPaid,
            balanceDue,
            paid: balanceDue <= 0,
            paymentMethod: valid.length > 1 ? "SPLIT" : lastMethod,
            updatedAt: new Date().toISOString(),
          };
        }),
      }));

      try {
        await supabase.from("invoices").update({
          paid: (currentBalance ?? totalEntered) - totalEntered <= 0,
          payment_method: valid.length > 1 ? "SPLIT" : lastMethod,
          updated_at: new Date().toISOString(),
        }).eq("id", invoiceId);
      } catch {}

      try {
        await supabase.from("audit_logs").insert({
          action: "payment_recorded",
          entity_type: "invoice",
          entity_id: invoiceId,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: { lines: valid },
        });
      } catch {}

      toast({
        title:
          valid.length > 1
            ? `${valid.length} payments totaling ${totalEntered.toLocaleString()} recorded`
            : `Payment of ${totalEntered.toLocaleString()} recorded`,
      });
    } catch (error: any) {
      toast({
        title: "Error recording payment",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  },

  updatePayment: async (invoiceId, paymentId, amount, method) => {
    assertOnline(get);
    if (!(amount > 0)) {
      toast({ title: "Enter a payment amount greater than zero", variant: "destructive" });
      throw new Error("Payment amount must be greater than zero");
    }

    const invoice = get().invoices.find((inv) => inv.id === invoiceId);
    const existing = invoice?.payments?.find((p) => p.id === paymentId);
    const otherPaymentsTotal =
      (invoice?.payments || [])
        .filter((p) => p.id !== paymentId)
        .reduce((sum, p) => sum + p.amount, 0);
    if (invoice && otherPaymentsTotal + amount > invoice.total + 1) {
      toast({
        title: "Amount exceeds invoice total",
        description: `That would put total payments above ${invoice.total.toLocaleString()}.`,
        variant: "destructive",
      });
      throw new Error("Payment amount exceeds invoice total");
    }

    try {
      const { error } = await supabase
        .from("payments")
        .update({ amount, method })
        .eq("id", paymentId);
      if (error) throw new Error(`Failed to update payment: ${error.message}`);

      set((state) => ({
        invoices: state.invoices.map((inv) => {
          if (inv.id !== invoiceId) return inv;
          const payments = (inv.payments || []).map((p) =>
            p.id === paymentId ? { ...p, amount, method } : p
          );
          const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
          const balanceDue = Math.max(0, inv.total - amountPaid);
          return { ...inv, payments, amountPaid, balanceDue, paid: balanceDue <= 0 };
        }),
      }));

      try {
        const { error: invError } = await supabase
          .from("invoices")
          .update({
            paid: otherPaymentsTotal + amount >= (invoice?.total ?? amount) - 0.01,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoiceId);
        if (invError) throw invError;
      } catch {}

      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "payment_updated",
          entity_type: "invoice",
          entity_id: invoiceId,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: { paymentId, from: existing, to: { amount, method } },
        });
      } catch {}

      toast({ title: "Payment updated" });
    } catch (error: any) {
      toast({
        title: "Error updating payment",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  },

  deletePayment: async (invoiceId, paymentId) => {
    assertOnline(get);
    try {
      const { error } = await supabase.from("payments").delete().eq("id", paymentId);
      if (error) throw new Error(`Failed to delete payment: ${error.message}`);

      let newAmountPaid = 0;
      let newTotal = 0;
      set((state) => ({
        invoices: state.invoices.map((inv) => {
          if (inv.id !== invoiceId) return inv;
          const payments = (inv.payments || []).filter((p) => p.id !== paymentId);
          const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
          const balanceDue = Math.max(0, inv.total - amountPaid);
          newAmountPaid = amountPaid;
          newTotal = inv.total;
          return { ...inv, payments, amountPaid, balanceDue, paid: balanceDue <= 0 };
        }),
      }));

      try {
        await supabase.from("invoices").update({
          paid: newTotal > 0 ? newAmountPaid >= newTotal - 0.01 : false,
          updated_at: new Date().toISOString(),
        }).eq("id", invoiceId);
      } catch {}

      try {
        const { currentUserPhone, currentUserName } = get();
        await supabase.from("audit_logs").insert({
          action: "payment_deleted",
          entity_type: "invoice",
          entity_id: invoiceId,
          actor_phone: currentUserPhone,
          actor_name: currentUserName,
          changes: { paymentId },
        });
      } catch {}

      toast({ title: "Payment removed" });
    } catch (error: any) {
      toast({
        title: "Error deleting payment",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  },
}));
