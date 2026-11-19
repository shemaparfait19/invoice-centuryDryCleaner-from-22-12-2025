// Pure calculation model for the Daily Cash Report — no Supabase, no React.
// Kept separate so the numbers can be checked on their own (see the test
// checklist in the report page) and reused by the print view and the Excel
// export.

import { formatCurrency } from "./utils";
import {
  canonicalItemName,
  categoryKind,
  lookupItemCategory,
  parseItemLine,
} from "./item-catalog";
import type { MoneyAccount, PaymentStatus } from "./types";

export interface ReportSaleItem {
  description: string;
  quantity: number;
  // Line price, used to split an invoice's total and payments across items.
  totalPrice?: number;
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
  // Who bought it. null clientName means a walk-in customer. Never printed
  // on the daily report.
  clientId?: string | null;
  clientName?: string | null;
  // Money handed over after the sale (filled in by the history list only).
  collected?: number;
}

// Money collected on a later day for a product / extra sold on credit.
export interface ReportProductPayment {
  id: string;
  extraSaleId: string;
  amount: number;
  method: string;
  account: MoneyAccount | null;
  paidAt: string;
  saleSoldAt: string;
  saleCategory: "product" | "extra";
  saleDescription: string;
  saleQuantity: number;
  saleTotalPrice: number;
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
  // Product money collected on the report's day for sales made earlier.
  productPayments?: ReportProductPayment[];
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
  "container",
  "jerrycan",
  "jerry can",
  "bucket",
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
  // The shop's own item list decides first: whatever category staff gave an
  // item is where it is counted. Only a name the list does not know falls back
  // to the keyword guesses below.
  const known =
    lookupItemCategory(shortItemName(description)) ??
    lookupItemCategory(description);
  if (known) return categoryKind(known) !== "dry_cleaning";
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

// "single coat x1, Tie x2" — used in the item-level table header rows and in
// the old-debt list, never with a client name or invoice number.
export function summarizeItemList(items: ReportSaleItem[]): string {
  if (!items || items.length === 0) return "—";
  const grouped = new Map<string, number>();
  for (const item of items) {
    const name = canonicalItemName(shortItemName(item.description));
    grouped.set(name, (grouped.get(name) || 0) + item.quantity);
  }
  return Array.from(grouped.entries())
    .map(([name, qty]) => `${name} x${qty}`)
    .join(", ");
}

export interface ExpandedItemLine {
  description: string;
  quantity: number;
  totalPrice: number;
}

// One line may name several garments ("Shirt x4, Underpants x5, Socks x3,
// Shoes x1"); this turns it into one line per garment, sharing that line's
// money by piece (a flat per-piece price), so nothing is merged into one row.
export function expandItemLines(items: ReportSaleItem[]): ExpandedItemLine[] {
  const lines: ExpandedItemLine[] = [];
  for (const line of items) {
    const money = Math.max(0, line.totalPrice ?? 0);
    const pieces = parseItemLine(line.description || "");
    if (!pieces || pieces.length === 0) {
      lines.push({
        description: line.description,
        quantity: line.quantity,
        totalPrice: money,
      });
      continue;
    }
    if (pieces.length === 1) {
      lines.push({
        description: pieces[0].name,
        quantity: pieces[0].quantity || line.quantity,
        totalPrice: money,
      });
      continue;
    }
    const pieceCount = pieces.reduce((sum, piece) => sum + piece.quantity, 0);
    const perPiece = pieceCount > 0 ? money / pieceCount : 0;
    let given = 0;
    pieces.forEach((piece, index) => {
      const amount =
        index === pieces.length - 1
          ? round2(money - given)
          : round2(perPiece * piece.quantity);
      given = round2(given + amount);
      lines.push({
        description: piece.name,
        quantity: piece.quantity,
        totalPrice: amount,
      });
    });
  }
  return lines;
}

// Splits an amount across lines proportionally; the last line takes the
// rounding remainder so the parts always add back to the whole.
export function allocate(total: number, shares: number[]): number[] {
  const out: number[] = [];
  let used = 0;
  shares.forEach((share, index) => {
    if (index === shares.length - 1) {
      out.push(round2(total - used));
    } else {
      const value = round2(total * share);
      used = round2(used + value);
      out.push(value);
    }
  });
  return out;
}

function rowStatus(
  paid: number,
  pendingMomo: number,
  debt: number
): "paid" | "partial" | "unpaid" | "pending" {
  if (debt <= 0.5) return "paid";
  if (paid > 0) return "partial";
  if (pendingMomo > 0) return "pending";
  return "unpaid";
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
  // One row per item line ("single coat"), not per invoice.
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
  status: "paid" | "partial" | "unpaid" | "pending";
  // Money collected today for an invoice created on an earlier day.
  oldDebt?: boolean;
  // Set on rows that came from a manual product/extra sale, so the UI can
  // offer a delete for it. Invoice item rows never carry this.
  sourceId?: string;
  deletable?: boolean;
}

// A row of the A. Sales table in either view. "By item" rows come from
// SaleRow; "by invoice" rows show one invoice with its items listed.
export interface ReportTableRow {
  key: string;
  items: string;
  qty: number;
  cash: number;
  momo: number;
  debt: number;
  total: number;
  status: "paid" | "partial" | "unpaid" | "pending";
  time?: number;
  deletable?: boolean;
  sourceId?: string;
  oldDebt?: boolean;
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
  // Same day, seen invoice by invoice: "Shirt x6, Pants x1 — paid / part paid".
  invoiceRows: ReportTableRow[];
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
    items: string;
    method: string;
    amount: number;
    pending: boolean;
  }[];
  oldDebtPending: number;
  accounts: AccountRow[];
  totalWithdrawals: number;
  net: number;
  byType: TypeRow[];
  // How many of each garment/product came in today, for the boss's count:
  // "Pants 12 · Jeans 4 · Bed cover 3".
  itemCounts: { name: string; qty: number }[];
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
  const invoiceRows: ReportTableRow[] = [];
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

    // Rebuild the invoice element by element: one row per item the client
    // brought, carrying that item's OWN amount (quantity × price), and its
    // share of whatever was paid on the invoice. Only when the invoice total
    // does not equal the sum of its lines (a discount or an adjustment) are the
    // line amounts scaled, so the rows still add up to the invoice exactly.
    const sourceLines =
      invoice.items.length > 0
        ? invoice.items
        : [
            {
              description: "No items recorded",
              quantity: 0,
              totalPrice: invoice.total,
            },
          ];
    // A line may name several garments ("Shirt x4, Underpants x5, Socks x3");
    // expandItemLines breaks it into one row per garment.
    const lines = expandItemLines(sourceLines);
    const linePrices = lines.map((item) => Math.max(0, item.totalPrice ?? 0));
    const weightTotal = linePrices.reduce((sum, price) => sum + price, 0);
    const lineSum = round2(weightTotal);
    // With no usable line prices, split by quantity rather than evenly.
    const fallbackWeights = lines.map((item) => Math.max(0, item.quantity));
    const fallbackTotal = fallbackWeights.reduce((sum, qty) => sum + qty, 0);
    const shares = lines.map((item, index) => {
      if (weightTotal > 0) return linePrices[index] / weightTotal;
      return fallbackTotal > 0
        ? fallbackWeights[index] / fallbackTotal
        : 1 / lines.length;
    });

    let totalShares: number[];
    if (weightTotal > 0 && Math.abs(lineSum - invoice.total) <= 0.5) {
      // Normal case: the item amounts are the invoice amounts.
      totalShares = linePrices.map((price) => round2(price));
      const remainder = round2(
        invoice.total - totalShares.reduce((sum, value) => sum + value, 0)
      );
      const last = totalShares.length - 1;
      totalShares[last] = round2(totalShares[last] + remainder);
    } else {
      // No line prices, or the invoice total was adjusted: scale the lines.
      totalShares = allocate(invoice.total, shares);
    }

    const cashShares = allocate(cash, shares);
    const momoShares = allocate(momo, shares);
    const pendingShares = allocate(pendingMomo, shares);
    const otherShares = allocate(other, shares);
    const time = Date.parse(invoice.createdAt);

    const invoiceRowStart = rows.length;
    lines.forEach((item, index) => {
      const lineCash = cashShares[index];
      const lineMomo = momoShares[index];
      const linePending = pendingShares[index];
      const lineOther = otherShares[index];
      const lineTotal = totalShares[index];
      const lineDebt = Math.max(
        0,
        round2(lineTotal - (lineCash + lineMomo + linePending + lineOther))
      );

      rows.push({
        key: `item-${invoice.id}-${index}`,
        items: canonicalItemName(shortItemName(item.description)),
        qty: item.quantity,
        cash: lineCash,
        momo: lineMomo,
        pendingMomo: linePending,
        other: lineOther,
        total: lineTotal,
        debt: lineDebt,
        category: isProductLine(item.description)
          ? "product"
          : "dry_cleaning",
        time,
        status: rowStatus(lineCash + lineMomo + lineOther, linePending, lineDebt),
      });
    });

    // The same invoice collapsed into one row, for the "by invoice" view.
    const invoiceLines = rows.slice(invoiceRowStart);
    const invoiceDebt = round2(
      invoiceLines.reduce((sum, row) => sum + row.debt, 0)
    );
    const invoicePaid = round2(
      invoiceLines.reduce(
        (sum, row) => sum + row.cash + row.momo + row.other,
        0
      )
    );
    const invoicePending = round2(
      invoiceLines.reduce((sum, row) => sum + row.pendingMomo, 0)
    );
    // The time is not printed here (the invoice itself carries it); it is only
    // used to keep the rows in the order the clothes came in.
    invoiceRows.push({
      key: `inv-${invoice.id}`,
      items: lines
        .map(
          (line) =>
            `${canonicalItemName(
              shortItemName(line.description)
            )} x${line.quantity}`
        )
        .join(", "),
      qty: invoiceLines.reduce((sum, row) => sum + row.qty, 0),
      cash: round2(invoiceLines.reduce((sum, row) => sum + row.cash, 0)),
      momo: round2(invoiceLines.reduce((sum, row) => sum + row.momo, 0)),
      debt: invoiceDebt,
      total: round2(invoiceLines.reduce((sum, row) => sum + row.total, 0)),
      status: rowStatus(invoicePaid, invoicePending, invoiceDebt),
      time,
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
      items: canonicalItemName(shortItemName(sale.description)),
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
      sourceId: sale.id,
      deletable: true,
      status: rowStatus(
        sale.amountPaidCash + sale.amountPaidMomo,
        0,
        Math.max(
          0,
          round2(
            sale.totalPrice - (sale.amountPaidCash + sale.amountPaidMomo)
          )
        )
      ),
    });
  }

  // Product money handed over today for a product sold on credit. When the
  // sale was made on an earlier day it belongs on page 2 with the old
  // invoices; when it was sold and paid today it is simply today's money.
  for (const payment of data.productPayments || []) {
    const soldOn = Date.parse(payment.saleSoldAt);
    if (Number.isNaN(soldOn)) continue;
    const sameDay = soldOn >= fromTime && soldOn <= toTime;
    const category: SaleCategory =
      payment.saleCategory === "extra" ? "extra" : "product";
    const isCash = payment.method === "CASH";
    const isMomo = payment.method === "MOMO";
    if (isCash || isMomo) {
      addToAccount(payment.method, payment.account, category, payment.amount);
    }
    rows.push({
      key: `pp-${payment.id}`,
      items: canonicalItemName(shortItemName(payment.saleDescription)),
      // The pieces were counted on the day they were sold; this row is only
      // the money that arrived today.
      qty: 0,
      cash: isCash ? payment.amount : 0,
      momo: isMomo ? payment.amount : 0,
      pendingMomo: 0,
      other: isCash || isMomo ? 0 : payment.amount,
      total: payment.amount,
      debt: 0,
      category,
      time: Date.parse(payment.paidAt),
      status: "paid",
      oldDebt: !sameDay,
    });
  }

  rows.sort((a, b) => a.time - b.time);

  // Payments received today against invoices created on an earlier day.
  const oldDebtList: ReportModel["oldDebtList"] = [];
  let oldDebtReceived = 0;
  let oldDebtCash = 0;
  let oldDebtMomo = 0;
  let oldDebtPending = 0;

  // Items received today, counted before money collected on old invoices is
  // added in, so "Items today" stays a count of goods that came in today.
  const todayItemCountMap = new Map<string, number>();
  for (const row of rows) {
    if (row.oldDebt) continue;
    todayItemCountMap.set(row.items, (todayItemCountMap.get(row.items) || 0) + row.qty);
  }

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
      items: summarizeItemList(items),
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

    // Also show it in today's sales table: this money was collected today, so
    // it belongs with the day's money. Its "total" is the amount received
    // (there is no new billing — the invoice was billed earlier), split over
    // the garment lines so each garment keeps its own row and its own money.
    const collected = expandItemLines(items);
    const collectedLines =
      collected.length > 0
        ? collected
        : [
            {
              description: "—",
              quantity: 0,
              totalPrice: payment.amount,
            },
          ];
    const collectedWeights = collectedLines.map((line) =>
      line.totalPrice > 0 ? line.totalPrice : line.quantity
    );
    const collectedWeightTotal = collectedWeights.reduce(
      (sum, weight) => sum + weight,
      0
    );
    const collectedShares =
      collectedWeightTotal > 0
        ? collectedWeights.map((weight) => weight / collectedWeightTotal)
        : collectedLines.map(() => 1 / collectedLines.length);
    const collectedAmounts = allocate(payment.amount, collectedShares);

    collectedLines.forEach((line, index) => {
      const amount = collectedAmounts[index];
      rows.push({
        key: `old-${payment.id}-${index}`,
        items: canonicalItemName(shortItemName(line.description)),
        qty: line.quantity || 0,
        cash: payment.method === "CASH" ? amount : 0,
        momo: payment.method === "MOMO" ? amount : 0,
        pendingMomo: 0,
        other:
          payment.method === "CASH" || payment.method === "MOMO" ? 0 : amount,
        total: amount,
        debt: 0,
        category,
        time: Date.parse(payment.createdAt),
        status: "paid",
        oldDebt: true,
      });
    });

    // One row for the collection itself in the "by invoice" view: it is money
    // for an invoice billed on an earlier day, so it reads as that invoice.
    invoiceRows.push({
      key: `old-inv-${payment.id}`,
      items: `${summarizeItemList(items)} (old debt)`,
      qty: items.reduce((sum, item) => sum + item.quantity, 0),
      cash: payment.method === "CASH" ? payment.amount : 0,
      momo: payment.method === "MOMO" ? payment.amount : 0,
      debt: 0,
      total: payment.amount,
      status: "paid",
      oldDebt: true,
      time: Date.parse(payment.createdAt),
    });
  }

  // Deconstruct the day's invoices and rebuild them garment by garment: the
  // same item from several invoices (or from money collected on an old one)
  // becomes a single line with the quantities and the money added together.
  // Manual product/extra sales keep their own line so they stay deletable.
  const mergedRows: SaleRow[] = [];
  const mergedByItem = new Map<string, SaleRow>();
  for (const row of rows) {
    if (row.deletable || row.sourceId) {
      mergedRows.push(row);
      continue;
    }
    // Old-debt money is printed on its own sheet, so it must never merge into
    // a garment collected today (that would pull yesterday's cash onto today's
    // page). Old-debt rows still merge with each other.
    const key = `${row.oldDebt ? "old" : "new"}|${row.category}|${row.items}`;
    const existing = mergedByItem.get(key);
    if (!existing) {
      const copy = { ...row };
      mergedByItem.set(key, copy);
      mergedRows.push(copy);
      continue;
    }
    existing.qty += row.qty;
    existing.cash = round2(existing.cash + row.cash);
    existing.momo = round2(existing.momo + row.momo);
    existing.pendingMomo = round2(existing.pendingMomo + row.pendingMomo);
    existing.other = round2(existing.other + row.other);
    existing.total = round2(existing.total + row.total);
    existing.debt = round2(existing.debt + row.debt);
    existing.time = Math.min(existing.time, row.time);
    existing.oldDebt = Boolean(existing.oldDebt && row.oldDebt);
  }
  rows.length = 0;
  for (const row of mergedRows) {
    const paid = round2(row.cash + row.momo + row.other);
    row.status = rowStatus(paid, row.pendingMomo, row.debt);
    rows.push(row);
  }

  // Old-debt rows were added after the first sort, so order the table again.
  rows.sort((a, b) => a.time - b.time);
  invoiceRows.sort((a, b) => (a.time || 0) - (b.time || 0));

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
  // Old-debt money is now part of the table's received amount, so it must not
  // be added a second time here.
  const net = round2(totalReceived - totalWithdrawals);

  const sumType = (category: SaleCategory) => {
    const matching = rows.filter(
      (row) => !row.oldDebt && row.category === category
    );
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

  const itemCounts = Array.from(todayItemCountMap.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

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
      count: rows.filter((row) => row.oldDebt).length,
      billed: round2(
        rows.filter((row) => row.oldDebt).reduce((sum, row) => sum + row.total, 0)
      ),
      received: round2(
        rows
          .filter((row) => row.oldDebt)
          .reduce((sum, row) => sum + row.cash + row.momo + row.other, 0)
      ),
      unpaid: round2(
        rows.filter((row) => row.oldDebt).reduce((sum, row) => sum + row.debt, 0)
      ),
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
      `${oldDebtList.length} payment(s) received today belong to invoices created on a different date (old debt) — they are rows in A and count as money received today, but they are not new billing.`
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
    itemCounts,
    invoiceRows,
    checkPasses: Math.abs(checkDifference) <= 0.5,
    checkDifference,
    checkCauses,
    notes,
  };
}
