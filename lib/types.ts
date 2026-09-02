export interface Client {
  id: string;
  name: string;
  phone: string;
  address?: string;
  visitCount: number;
  rewardClaimed: boolean;
  // Loyalty: how many earned rewards (one per REWARD_MILESTONE visits, see
  // lib/loyalty.ts) the client has actually redeemed so far. Rewards
  // available = floor(visitCount / REWARD_MILESTONE) - rewardsRedeemed.
  rewardsRedeemed: number;
  lastVisit: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// One recorded payment against an invoice. An invoice can have several —
// a deposit now and the remainder later, optionally via different methods.
export interface Payment {
  id: string;
  amount: number;
  method: string;
  paidByName?: string;
  paidByPhone?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  client: Client;
  items: InvoiceItem[];
  total: number;
  paymentMethod: string;
  paid?: boolean;
  payments?: Payment[];
  // Derived from `payments` — sum of amounts, and total - amountPaid.
  amountPaid?: number;
  balanceDue?: number;
  status: "pending" | "completed" | "cancelled";
  pickupDate?: string;
  pickupTime?: string;
  notes?: string;
  section?: string;
  // Drop-off details, confirmed once per invoice via the required dialog
  // in the invoice form so staff never have to rely on memory at pickup.
  hangersBrought?: boolean;
  hangersCount?: number;
  coversBrought?: boolean;
  coversCount?: number;
  createdByName?: string;
  createdByPhone?: string;
  completedByName?: string;
  completedByPhone?: string;
  // Set only at the moment status actually becomes "completed" — unlike
  // updatedAt, which a DB trigger bumps on ANY update (including unrelated
  // ones like a client merge), so it can't be trusted for "when completed".
  completedAt?: string;
  paidByName?: string;
  paidByPhone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserAccount {
  id: string;
  name: string;
  phone: string;
  role: "user" | "admin";
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: "invoice" | "client" | "user";
  entityId: string;
  actorPhone?: string;
  actorName?: string;
  changes?: unknown;
  createdAt: string;
}
