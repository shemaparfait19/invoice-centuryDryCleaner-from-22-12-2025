export interface Client {
  id: string;
  name: string;
  phone: string;
  address?: string;
  visitCount: number;
  rewardClaimed: boolean;
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

export interface Invoice {
  id: string;
  client: Client;
  items: InvoiceItem[];
  total: number;
  paymentMethod: string;
  paid?: boolean;
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
