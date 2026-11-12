// Pure calculation model for the Daily Cash Report — no Supabase, no React.
// Kept separate so the numbers can be checked on their own (see the test
// checklist in the report page) and reused by the print view and the Excel
// export.

import { formatCurrency } from "./utils";
import type { MoneyAccount, PaymentStatus } from "./types";

export interface ReportSaleItem {
  description: string;
  quantity: number;
}

export interface ReportInvoicePayment {
  id: string;
  amount: number;
  method: string;
  account: MoneyAccount | null;
  status: PaymentStatus;
  createdAt: string;
}

export interface ReportInvoice {
  id: string;
  total: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  items: ReportSaleItem[];
  payments: ReportInvoicePayment[];
}

// A payment with a created_at inside the selected day. Its invoice may have
// been created earlier — that is exactly the "old debt paid today" case.
export interface ReportPayment {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  account: MoneyAccount | null;
  status: PaymentStatus;
  createdAt: string;
  invoiceCreatedAt: string;
  invoiceStatus: string;
  items: ReportSaleItem[];
}

export interface ReportExtraSale {
  id: string;
  soldAt: string;
  category: "product" | "extra";
  description: string;
  quantity: number;
  totalPrice: number;
  amountPaidCash: number;
  amountPaidMomo: number;
  account: MoneyAccount | null;
}

export interface ReportWithdrawal {
  id: string;
  withdrawnAt: string;
  account: MoneyAccount;
  amount: number;
  note: string;
}

export interface ReportOpening {
  reportDate: string;
  openingCleanerPhone: number;
  openingProductsPhone: number;
  openingCash: number;
}

export interface DailyCashReportData {
  invoices: ReportInvoice[];
  dayPayments: ReportPayment[];
  extraSales: ReportExtraSale[];
  withdrawals: ReportWithdrawal[];
  opening: ReportOpening | null;
  // Human-readable setup problems (e.g. migration not run yet) shown in the
  // report notes instead of failing the whole page.
  issues: string[];
}

export type SaleCategory = "dry_cleaning" | "product" | "extra";

export function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  return new Date(y, (m || 1) - 1, d || 1);
}

export function getDayRangeIso(ymd: string): { fromIso: string; toIso: string } {
  const from = parseLocalYmd(ymd);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setHours(23, 59, 59, 999);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = parseLocalYmd(ymd);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// A product keyword only counts when the line is NOT a laundry service —
// "Bed Cover Washing" contains "cover" but is dry cleaning, not a product.
// "cover" is deliberately absent: on an invoice it almost always means a bed /
// sofa / cushion cover (laundry). Covers actually sold as extras go through
// extra_sales, which carries an explicit category.
const PRODUCT_KEYWORDS = [
  "detergent",
  "hanger",
  "hand wash",
  "handwash",
  "hand-wash",
  "soap",
  "softener",
  "bleach",
  "starch",
  "perfume",
  "sachet",
  "plastic bag",
];

const SERVICE_WORDS = ["washing", "cleaning", "ironing", "steaming", "laundry"];

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isProductLine(description: string): boolean {
  const text = description.toLowerCase();
  if (SERVICE_WORDS.some((word) => text.includes(word))) return false;
  return PRODUCT_KEYWORDS.some((word) => text.includes(word));
}

// "Shorts Washing" → "Shorts", "Suit Washing (Jacket, Complete)" → "Suit".
export function shortItemName(description: string): string {
  const withoutDetails = description.replace(/\([^)]*\)/g, "").trim();
  const shortened = withoutDetails
    .replace(/\s+(washing|cleaning|service)$/i, "")
    .trim();
  return shortened || description;
}

export function classifyInvoice(invoice: ReportInvoice): SaleCategory {
  if (!invoice.items || invoice.items.length === 0) return "dry_cleaning";
  return invoice.items.every((item) => isProductLine(item.description))
    ? "product"
    : "dry_cleaning";
}

export function summarizeItems(invoice: ReportInvoice): string {
  if (!invoice.items || invoice.items.length === 0) return "No items recorded";
  const grouped = new Map<string, number>();
  for (const item of invoice.items) {
    const name = shortItemName(item.description);
    grouped.set(name, (grouped.get(name) || 0) + item.quantity);
  }
  return Array.from(grouped.entries())
    .map(([name, qty]) => `${name} x${qty}`)
    .join(", ");
}

// Which account a payment landed in. A stored account always wins; otherwise
// the documented default applies (cash → cash box, dry cleaning MoMo →
// cleaner phone, product/extra MoMo → products phone). Anything that cannot be
// placed is reported as "unassigned"/"other" in the notes instead of guessed.
export function resolveAccount(
  method: string,
  storedAccount: MoneyAccount | null,
  category: SaleCategory
): MoneyAccount | "unassigned" | "other" {
  if (storedAccount) return storedAccount;
  if (method === "CASH") return "cash";
  if (method === "MOMO") {
    return category === "dry_cleaning" ? "cleaner_phone" : "products_phone";
  }
  return "other";
}

export interface SaleRow {
  key: string;
  items: string;
  qty: number;
  cash: number;
  momo: number;
  pendingMomo: number;
  other: number;
  total: number;
  debt: number;
  category: SaleCategory;
  time: number;
}

export interface AccountRow {
  account: MoneyAccount | "unassigned";
  opening: number;
  received: number;
  withdrawn: number;
  balance: number;
}

export interface TypeRow {
  key: SaleCategory | "old_debt";
  label: string;
  count: number;
  billed: number;
  received: number;
  unpaid: number;
}

export interface ReportModel {
  rows: SaleRow[];
  cashReceived: number;
  momoReceived: number;
  otherReceived: number;
  totalAmount: number;
  totalDebt: number;
  totalReceived: number;
  pendingMomo: number;
  oldDebtReceived: number;
  oldDebtCash: number;
  oldDebtMomo: number;
  oldDebtList: {
    key: string;
    time: string;
    method: string;
    amount: number;
    pending: boolean;
  }[];
  oldDebtPending: number;
  accounts: AccountRow[];
  totalWithdrawals: number;
  net: number;
  byType: TypeRow[];
  checkPasses: boolean;
  checkDifference: number;
  checkCauses: string[];
  notes: string[];
}

export const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  MOMO: "Mobile Money",
  BANK: "Bank",
  CARD: "Card",
};

export function buildReport(
  data: DailyCashReportData,
  ymd: string
): ReportModel {
  const { fromIso, toIso } = getDayRangeIso(ymd);
  const fromTime = Date.parse(fromIso);
  const toTime = Date.parse(toIso);

  const inDay = (iso: string) => {
    const time = Date.parse(iso);
    return time >= fromTime && time <= toTime;
  };

  const rows: SaleRow[] = [];
  let cancelledCount = 0;
  let missingItems = 0;

  // Money per account, accumulated from actual payments.
  const accountReceived = new Map<string, number>();
  const addToAccount = (
    method: string,
    storedAccount: MoneyAccount | null,
    category: SaleCategory,
    amount: number
  ) => {
    const account = resolveAccount(method, storedAccount, category);
    accountReceived.set(account, (accountReceived.get(account) || 0) + amount);
  };

  for (const invoice of data.invoices) {
    if (invoice.status === "cancelled") {
      cancelledCount++;
      continue;
    }
    if (!invoice.items || invoice.items.length === 0) missingItems++;

    const category = classifyInvoice(invoice);
    const todaysPayments = invoice.payments.filter((p) => inDay(p.createdAt));

    let cash = 0;
    let momo = 0;
    let pendingMomo = 0;
    let other = 0;

    for (const payment of todaysPayments) {
      if (payment.status === "pending") {
        if (payment.method === "MOMO") pendingMomo += payment.amount;
        continue;
      }
      if (payment.method === "CASH") cash += payment.amount;
      else if (payment.method === "MOMO") momo += payment.amount;
      else other += payment.amount;

      addToAccount(payment.method, payment.account, category, payment.amount);
    }

    rows.push({
      key: `inv-${invoice.id}`,
      items: summarizeItems(invoice),
      qty: invoice.items.reduce((sum, item) => sum + item.quantity, 0),
      cash,
      momo,
      pendingMomo,
      other,
      total: invoice.total,
      debt: Math.max(
        0,
        round2(invoice.total - (cash + momo + pendingMomo + other))
      ),
      category,
      time: Date.parse(invoice.createdAt),
    });
  }

  for (const sale of data.extraSales) {
    const category: SaleCategory =
      sale.category === "extra" ? "extra" : "product";
    if (sale.amountPaidCash > 0) {
      addToAccount("CASH", sale.account, category, sale.amountPaidCash);
    }
    if (sale.amountPaidMomo > 0) {
      addToAccount("MOMO", sale.account, category, sale.amountPaidMomo);
    }
    rows.push({
      key: `extra-${sale.id}`,
      items: `${shortItemName(sale.description)} x${sale.quantity}`,
      qty: sale.quantity,
      cash: sale.amountPaidCash,
      momo: sale.amountPaidMomo,
      pendingMomo: 0,
      other: 0,
      total: sale.totalPrice,
      debt: Math.max(
        0,
        round2(sale.totalPrice - (sale.amountPaidCash + sale.amountPaidMomo))
      ),
      category,
      time: Date.parse(sale.soldAt),
    });
  }

  rows.sort((a, b) => a.time - b.time);

  // Payments received today against invoices created on an earlier day.
  const oldDebtList: ReportModel["oldDebtList"] = [];
  let oldDebtReceived = 0;
  let oldDebtCash = 0;
  let oldDebtMomo = 0;
  let oldDebtPending = 0;

  for (const payment of data.dayPayments) {
    if (!payment.invoiceCreatedAt) continue;
    if (Date.parse(payment.invoiceCreatedAt) >= fromTime) continue;
    if (payment.invoiceStatus === "cancelled") continue;

    const items = payment.items || [];
    const category: SaleCategory =
      items.length > 0 && items.every((item) => isProductLine(item.description))
        ? "product"
        : "dry_cleaning";

    const entry = {
      key: `old-${payment.id}`,
      time: new Date(payment.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      method: METHOD_LABELS[payment.method] || payment.method,
      amount: payment.amount,
      pending: payment.status === "pending",
    };

    if (payment.status === "pending") {
      oldDebtPending += payment.amount;
      oldDebtList.push(entry);
      continue;
    }

    oldDebtReceived += payment.amount;
    if (payment.method === "CASH") oldDebtCash += payment.amount;
    if (payment.method === "MOMO") oldDebtMomo += payment.amount;
    addToAccount(payment.method, payment.account, category, payment.amount);

    oldDebtList.push(entry);
  }

  const cashReceived = round2(rows.reduce((sum, row) => sum + row.cash, 0));
  const momoReceived = round2(rows.reduce((sum, row) => sum + row.momo, 0));
  const otherReceived = round2(rows.reduce((sum, row) => sum + row.other, 0));
  const totalAmount = round2(rows.reduce((sum, row) => sum + row.total, 0));
  const totalDebt = round2(rows.reduce((sum, row) => sum + row.debt, 0));
  const pendingMomo = round2(rows.reduce((sum, row) => sum + row.pendingMomo, 0));

  // Total amount received = everything billed today minus what is still owed.
  const totalReceived = round2(totalAmount - totalDebt);
  const checkDifference = round2(totalReceived - (cashReceived + momoReceived));

  const checkCauses: string[] = [];
  if (Math.abs(checkDifference) > 0.5) {
    if (otherReceived > 0) {
      checkCauses.push(
        `${formatCurrency(
          otherReceived
        )} was received by bank/card, which is not a cash or Mobile Money account.`
      );
    }
    if (pendingMomo > 0) {
      checkCauses.push(
        `${formatCurrency(
          pendingMomo
        )} of pending Mobile Money is counted as debt until confirmed.`
      );
    }
    const overpaid = rows.filter(
      (row) =>
        row.cash + row.momo + row.pendingMomo + row.other > row.total + 0.5
    );
    if (overpaid.length > 0) {
      checkCauses.push(
        `${overpaid.length} sale(s) have payments larger than their total — check those payment amounts.`
      );
    }
    if (checkCauses.length === 0) {
      checkCauses.push(
        "Some payments were recorded on sales whose total does not match the sum of payments."
      );
    }
  }

  const opening = data.opening;
  const accountRows: AccountRow[] = (
    ["cleaner_phone", "products_phone", "cash", "unassigned"] as const
  ).map((account) => {
    const openingValue =
      account === "cleaner_phone"
        ? opening?.openingCleanerPhone || 0
        : account === "products_phone"
        ? opening?.openingProductsPhone || 0
        : account === "cash"
        ? opening?.openingCash || 0
        : 0;
    const received = round2(accountReceived.get(account) || 0);
    const withdrawn = round2(
      data.withdrawals
        .filter((withdrawal) => withdrawal.account === account)
        .reduce((sum, withdrawal) => sum + withdrawal.amount, 0)
    );
    return {
      account,
      opening: openingValue,
      received,
      withdrawn,
      balance: round2(openingValue + received - withdrawn),
    };
  });

  // Only show the Unassigned line when there is something on it.
  const visibleAccounts = accountRows.filter(
    (row) =>
      row.account !== "unassigned" || row.received !== 0 || row.balance !== 0
  );

  const totalWithdrawals = round2(
    data.withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0)
  );
  const net = round2(totalReceived + oldDebtReceived - totalWithdrawals);

  const sumType = (category: SaleCategory) => {
    const matching = rows.filter((row) => row.category === category);
    return {
      count: matching.length,
      billed: round2(matching.reduce((sum, row) => sum + row.total, 0)),
      received: round2(
        matching.reduce((sum, row) => sum + row.cash + row.momo + row.other, 0)
      ),
      unpaid: round2(matching.reduce((sum, row) => sum + row.debt, 0)),
    };
  };

  const dryCleaning = sumType("dry_cleaning");
  const products = sumType("product");
  const extras = sumType("extra");

  const byType: TypeRow[] = [
    { key: "dry_cleaning", label: "Dry cleaning", ...dryCleaning },
    { key: "product", label: "Products/detergents", ...products },
    {
      key: "extra",
      label: "Extra sales (hanger, cover, hand wash...)",
      ...extras,
    },
    {
      key: "old_debt",
      label: "Old debt payments",
      count: oldDebtList.filter((entry) => !entry.pending).length,
      billed: 0,
      received: round2(oldDebtReceived),
      unpaid: 0,
    },
  ];

  const notes: string[] = [];
  if (pendingMomo + oldDebtPending > 0) {
    notes.push(
      `Pending Mobile Money of ${formatCurrency(
        pendingMomo + oldDebtPending
      )} is not confirmed yet — excluded from received, shown separately.`
    );
  }
  const unassigned = accountRows.find((row) => row.account === "unassigned");
  if (unassigned && unassigned.received !== 0) {
    notes.push(
      `${formatCurrency(
        unassigned.received
      )} of Mobile Money has no account stored — reported under "Unassigned" instead of guessing.`
    );
  }
  if (otherReceived > 0) {
    notes.push(
      `${formatCurrency(
        otherReceived
      )} was received by bank/card and is not part of the phone or cash accounts.`
    );
  }
  if (oldDebtList.length > 0) {
    notes.push(
      `${oldDebtList.length} payment(s) received today belong to invoices created on a different date (old debt) — included in received, not in today's billing.`
    );
  }
  if (cancelledCount > 0) {
    notes.push(
      `${cancelledCount} cancelled invoice(s) excluded from billed, received and debt.`
    );
  }
  if (missingItems > 0) {
    notes.push(`${missingItems} invoice(s) have no items recorded.`);
  }
  if (!opening) {
    notes.push(
      'No opening balances saved for this date — opening is treated as zero. Use "Opening balances" to enter them.'
    );
  }
  if (totalWithdrawals > totalReceived + oldDebtReceived) {
    notes.push(
      "Withdrawals are larger than the money received today — the accounts may be running on earlier balances."
    );
  }
  for (const issue of data.issues) notes.push(issue);

  return {
    rows,
    cashReceived,
    momoReceived,
    otherReceived,
    totalAmount,
    totalDebt,
    totalReceived,
    pendingMomo: round2(pendingMomo + oldDebtPending),
    oldDebtReceived: round2(oldDebtReceived),
    oldDebtCash: round2(oldDebtCash),
    oldDebtMomo: round2(oldDebtMomo),
    oldDebtList,
    oldDebtPending: round2(oldDebtPending),
    accounts: visibleAccounts,
    totalWithdrawals,
    net,
    byType,
    checkPasses: Math.abs(checkDifference) <= 0.5,
    checkDifference,
    checkCauses,
    notes,
  };
}
