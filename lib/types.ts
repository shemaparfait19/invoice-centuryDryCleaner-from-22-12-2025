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

// Where money physically landed. `cleaner_phone` and `products_phone` are the
// two Mobile Money numbers; `cash` is the cash box. See lib/daily-cash-report.ts
// for the default rule used when a payment has no stored account.
export type MoneyAccount = "cleaner_phone" | "products_phone" | "cash";

// A recorded Mobile Money payment is only money in hand once it is confirmed;
// `pending` ones are reported separately and never counted as received.
export type PaymentStatus = "confirmed" | "pending";

// One recorded payment against an invoice. An invoice can have several —
// a deposit now and the remainder later, optionally via different methods.
export interface Payment {
  id: string;
  amount: number;
  method: string;
  paidByName?: string;
  paidByPhone?: string;
  // Optional: which account received the money. Undefined/null means "use the
  // report's default rule" (cash → cash box, dry cleaning MoMo → cleaner phone,
  // product MoMo → products phone).
  account?: MoneyAccount | null;
  status?: PaymentStatus;
  createdAt: string;
}

// One row per report day: the money each account started the day with.
export interface DailyBalance {
  reportDate: string;
  openingCleanerPhone: number;
  openingProductsPhone: number;
  openingCash: number;
}

// Money the owner took out of an account.
export interface Withdrawal {
  id: string;
  withdrawnAt: string;
  account: MoneyAccount;
  amount: number;
  note?: string;
  createdBy?: string;
}

// A product (detergent, hand wash...) or extra (hanger, cover...) sold outside
// the dry-cleaning invoice flow — lib/services.ts has no product catalog.
export interface ExtraSale {
  id: string;
  soldAt: string;
  category: "product" | "extra";
  description: string;
  quantity: number;
  totalPrice: number;
  amountPaidCash: number;
  amountPaidMomo: number;
  account?: MoneyAccount | null;
  createdBy?: string;
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
