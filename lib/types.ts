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
  createdByName?: string;
  createdByPhone?: string;
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
