"use client";

// Supabase access for the Daily Cash Report.
//
// The report needs payments that were RECEIVED on a given day, not invoices
// created that day — money taken today for last week's invoice belongs to
// today's cash box. `fetchInvoicesForDateRange` (lib/supabase-store.ts) filters
// invoices by created_at, so it cannot answer that; the existing Advanced
// Reports page keeps using it untouched.
//
// Day boundaries are local time (Kigali, UTC+2), built the same way as
// computeFromTo in components/advanced-reports.tsx. All the arithmetic lives in
// lib/daily-cash-report-model.ts.

import { supabase } from "./supabase";
import type { MoneyAccount } from "./types";
import {
  addDaysYmd,
  getDayRangeIso,
  round2,
  type DailyCashReportData,
  type ReportProductPayment,
  type ReportExtraSale,
  type ReportInvoice,
  type ReportInvoicePayment,
  type ReportOpening,
  type ReportPayment,
  type ReportSaleItem,
  type ReportWithdrawal,
} from "./daily-cash-report-model";

export type {
  AccountRow,
  DailyCashReportData,
  ReportExtraSale,
  ReportInvoice,
  ReportInvoicePayment,
  ReportModel,
  ReportOpening,
  ReportPayment,
  ReportProductPayment,
  ReportSaleItem,
  ReportWithdrawal,
  SaleCategory,
  SaleRow,
  TypeRow,
} from "./daily-cash-report-model";
export { getDayRangeIso, parseLocalYmd, addDaysYmd } from "./daily-cash-report-model";

// Cached probe: has scripts/add-daily-cash-report.sql been run? Same
// backward-compatible pattern the store uses for its optional columns.
let paymentReportColumnsReady: boolean | null = null;

async function paymentsHaveReportColumns(): Promise<boolean> {
  if (paymentReportColumnsReady !== null) return paymentReportColumnsReady;
  try {
    const { error } = await supabase
      .from("payments")
      .select("account, status")
      .limit(1);
    paymentReportColumnsReady = !error;
  } catch {
    paymentReportColumnsReady = false;
  }
  return paymentReportColumnsReady;
}

function toItems(rawItems: any): ReportSaleItem[] {
  return (Array.isArray(rawItems) ? rawItems : []).map((item: any) => ({
    description: String(item?.description || ""),
    quantity: Number(item?.quantity || 0),
    totalPrice: Number(item?.total_price || 0),
  }));
}

function toPayment(raw: any): ReportInvoicePayment {
  return {
    id: raw.id,
    amount: Number(raw.amount || 0),
    method: String(raw.method || "").toUpperCase(),
    account: (raw.account as MoneyAccount | null) ?? null,
    status: raw.status === "pending" ? "pending" : "confirmed",
    createdAt: raw.created_at,
  };
}

export async function fetchDailyCashReport(
  ymd: string
): Promise<DailyCashReportData> {
  const { fromIso, toIso } = getDayRangeIso(ymd);
  const issues: string[] = [];
  const hasPaymentColumns = await paymentsHaveReportColumns();

  if (!hasPaymentColumns) {
    issues.push(
      "Payments have no account/status columns yet — run scripts/add-daily-cash-report.sql in Supabase to record which phone received each payment."
    );
  }

  // --- invoices created on the selected day -------------------------------
  const invoiceSelect = `
    id, total, status, payment_method, created_at,
    invoice_items(description, quantity, total_price),
    payments(*)
  `;

  const invoices: ReportInvoice[] = [];
  {
    const pageSize = 1000;
    let page = 0;
    for (;;) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("invoices")
        .select(invoiceSelect as any)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: true })
        .range(from, to);

      if (error) throw new Error(`Failed to load invoices: ${error.message}`);
      if (!data || data.length === 0) break;

      for (const raw of data as any[]) {
        invoices.push({
          id: raw.id,
          total: Number(raw.total || 0),
          status: raw.status,
          paymentMethod: String(raw.payment_method || ""),
          createdAt: raw.created_at,
          items: toItems(raw.invoice_items),
          payments: (Array.isArray(raw.payments) ? raw.payments : [])
            .map((payment: any) => toPayment(payment))
            .sort((a: ReportInvoicePayment, b: ReportInvoicePayment) =>
              a.createdAt.localeCompare(b.createdAt)
            ),
        });
      }

      if (data.length < pageSize) break;
      page++;
    }
  }

  // --- every payment received on the selected day -------------------------
  const dayPayments: ReportPayment[] = [];
  {
    const paymentSelect = hasPaymentColumns
      ? `id, invoice_id, amount, method, account, status, created_at,
         invoice:invoices!inner(id, status, created_at, invoice_items(description, quantity, total_price))`
      : `id, invoice_id, amount, method, created_at,
         invoice:invoices!inner(id, status, created_at, invoice_items(description, quantity, total_price))`;

    const pageSize = 1000;
    let page = 0;
    for (;;) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("payments")
        .select(paymentSelect as any)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: true })
        .range(from, to);

      if (error) {
        issues.push(`Could not load payments: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;

      for (const raw of data as any[]) {
        const invoice = Array.isArray(raw.invoice)
          ? raw.invoice[0]
          : raw.invoice;
        if (!invoice) continue;
        dayPayments.push({
          id: raw.id,
          invoiceId: raw.invoice_id,
          amount: Number(raw.amount || 0),
          method: String(raw.method || "").toUpperCase(),
          account: (raw.account as MoneyAccount | null) ?? null,
          status: raw.status === "pending" ? "pending" : "confirmed",
          createdAt: raw.created_at,
          invoiceCreatedAt: invoice.created_at,
          invoiceStatus: invoice.status,
          items: toItems(invoice.invoice_items),
        });
      }

      if (data.length < pageSize) break;
      page++;
    }
  }

  // --- extra sales --------------------------------------------------------
  let extraSales: ReportExtraSale[] = [];
  try {
    const { data, error } = await supabase
      .from("extra_sales")
      .select("*")
      .gte("sold_at", fromIso)
      .lte("sold_at", toIso)
      .order("sold_at", { ascending: true });
    if (error) throw error;
    extraSales = (data || []).map((row: any) => ({
      id: row.id,
      soldAt: row.sold_at,
      category: row.category === "extra" ? "extra" : "product",
      description: row.description || "",
      quantity: Number(row.quantity || 0),
      totalPrice: Number(row.total_price || 0),
      amountPaidCash: Number(row.amount_paid_cash || 0),
      amountPaidMomo: Number(row.amount_paid_momo || 0),
      account: (row.account as MoneyAccount | null) ?? null,
    }));
  } catch {
    issues.push(
      "extra_sales table not found — run scripts/add-daily-cash-report.sql to record product/extra sales."
    );
  }

  // --- product money collected later --------------------------------------
  let productPayments: ReportProductPayment[] = [];
  try {
    const { data, error } = await supabase
      .from("extra_sale_payments")
      .select(
        "id, extra_sale_id, amount, method, account, paid_at, sale:extra_sales!inner(id, sold_at, category, description, quantity, total_price)"
      )
      .gte("paid_at", fromIso)
      .lte("paid_at", toIso)
      .order("paid_at", { ascending: true });
    if (error) throw error;
    productPayments = (data || []).map((row: any) => ({
      id: row.id,
      extraSaleId: row.extra_sale_id,
      amount: Number(row.amount || 0),
      method: String(row.method || "").toUpperCase(),
      account: (row.account as MoneyAccount | null) ?? null,
      paidAt: row.paid_at,
      saleSoldAt: row.sale?.sold_at || row.paid_at,
      saleCategory: row.sale?.category === "extra" ? "extra" : "product",
      saleDescription: row.sale?.description || "",
      saleQuantity: Number(row.sale?.quantity || 0),
      saleTotalPrice: Number(row.sale?.total_price || 0),
    }));
  } catch (error: any) {
    if (String(error?.message || "").includes("extra_sale_payments")) {
      issues.push(
        "Product payments table not found — run scripts/add-extra-sale-payments.sql to collect products sold on credit."
      );
    }
  }

  // --- withdrawals --------------------------------------------------------
  let withdrawals: ReportWithdrawal[] = [];
  try {
    const { data, error } = await supabase
      .from("withdrawals")
      .select("*")
      .gte("withdrawn_at", fromIso)
      .lte("withdrawn_at", toIso)
      .order("withdrawn_at", { ascending: true });
    if (error) throw error;
    withdrawals = (data || []).map((row: any) => ({
      id: row.id,
      withdrawnAt: row.withdrawn_at,
      account: row.account as MoneyAccount,
      amount: Number(row.amount || 0),
      note: row.note || "",
    }));
  } catch {
    issues.push(
      "withdrawals table not found — run scripts/add-daily-cash-report.sql to record money taken out."
    );
  }

  // --- opening balances ---------------------------------------------------
  let opening: ReportOpening | null = null;
  try {
    const { data, error } = await supabase
      .from("daily_balances")
      .select("*")
      .eq("report_date", ymd)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      opening = {
        reportDate: data.report_date,
        openingCleanerPhone: Number(data.opening_cleaner_phone || 0),
        openingProductsPhone: Number(data.opening_products_phone || 0),
        openingCash: Number(data.opening_cash || 0),
      };
    }
  } catch {
    issues.push(
      "daily_balances table not found — run scripts/add-daily-cash-report.sql to save opening balances."
    );
  }

  return { invoices, dayPayments, extraSales, withdrawals, opening, issues };
}

export async function saveOpeningBalances(
  reportDate: string,
  values: { cleanerPhone: number; productsPhone: number; cash: number },
  closing?: { cleanerPhone: number; productsPhone: number; cash: number },
  createdBy?: string
): Promise<{ carriedForward: boolean }> {
  const { error } = await supabase.from("daily_balances").upsert(
    {
      report_date: reportDate,
      opening_cleaner_phone: values.cleanerPhone,
      opening_products_phone: values.productsPhone,
      opening_cash: values.cash,
      created_by: createdBy || null,
    },
    { onConflict: "report_date" }
  );
  if (error) throw new Error(error.message);

  // Prefill tomorrow's opening from today's closing — but never overwrite a
  // row the manager already saved or edited.
  if (!closing) return { carriedForward: false };

  const nextDate = addDaysYmd(reportDate, 1);
  const { data: existing, error: existingError } = await supabase
    .from("daily_balances")
    .select("id")
    .eq("report_date", nextDate)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return { carriedForward: false };

  const { error: nextError } = await supabase.from("daily_balances").insert({
    report_date: nextDate,
    opening_cleaner_phone: closing.cleanerPhone,
    opening_products_phone: closing.productsPhone,
    opening_cash: closing.cash,
    created_by: createdBy || null,
  });
  if (nextError) throw new Error(nextError.message);
  return { carriedForward: true };
}

export async function addWithdrawal(input: {
  withdrawnAt: string;
  account: MoneyAccount;
  amount: number;
  note?: string;
  createdBy?: string;
}): Promise<void> {
  const { error } = await supabase.from("withdrawals").insert({
    withdrawn_at: input.withdrawnAt,
    account: input.account,
    amount: input.amount,
    note: input.note || null,
    created_by: input.createdBy || null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteWithdrawal(id: string): Promise<void> {
  const { error } = await supabase.from("withdrawals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteExtraSale(id: string): Promise<void> {
  const { error } = await supabase.from("extra_sales").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// The client columns come from scripts/add-extra-sale-client.sql. Until that
// has run, the products page records sales without a buyer instead of failing.
export async function extraSaleClientFieldsReady(): Promise<boolean> {
  const { error } = await supabase
    .from("extra_sales")
    .select("client_name")
    .limit(1);
  return !error;
}

export async function updateExtraSale(
  id: string,
  patch: {
    description?: string;
    quantity?: number;
    totalPrice?: number;
    amountPaidCash?: number;
    amountPaidMomo?: number;
    soldAt?: string;
    category?: "product" | "extra";
    clientId?: string | null;
    clientName?: string | null;
  }
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.clientId !== undefined) row.client_id = patch.clientId;
  if (patch.clientName !== undefined) row.client_name = patch.clientName;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.totalPrice !== undefined) row.total_price = patch.totalPrice;
  if (patch.amountPaidCash !== undefined) {
    row.amount_paid_cash = patch.amountPaidCash;
  }
  if (patch.amountPaidMomo !== undefined) {
    row.amount_paid_momo = patch.amountPaidMomo;
  }
  if (patch.soldAt !== undefined) row.sold_at = patch.soldAt;
  if (patch.category !== undefined) row.category = patch.category;
  const { error } = await supabase
    .from("extra_sales")
    .update(row)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// The newest product/extra sales, for the past-records list on the products
// route.
export async function fetchExtraSaleHistory(
  limit: number
): Promise<ReportExtraSale[]> {
  const { data, error } = await supabase
    .from("extra_sales")
    .select("*")
    .order("sold_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data || []) as any[];

  // Money handed over later, so a settled sale doesn't look like debt.
  const collected = new Map<string, number>();
  if (rows.length > 0) {
    try {
      const { data: payments } = await supabase
        .from("extra_sale_payments")
        .select("extra_sale_id, amount")
        .in(
          "extra_sale_id",
          rows.map((row) => row.id)
        );
      for (const payment of (payments || []) as any[]) {
        collected.set(
          payment.extra_sale_id,
          (collected.get(payment.extra_sale_id) || 0) +
            Number(payment.amount || 0)
        );
      }
    } catch {
      // Migration not run yet: only what was paid at the counter counts.
    }
  }

  return rows.map((row: any) => ({
    id: row.id,
    soldAt: row.sold_at,
    category: row.category === "extra" ? "extra" : "product",
    description: row.description || "",
    quantity: Number(row.quantity || 0),
    totalPrice: Number(row.total_price || 0),
    amountPaidCash: Number(row.amount_paid_cash || 0),
    amountPaidMomo: Number(row.amount_paid_momo || 0),
    account: (row.account as MoneyAccount | null) ?? null,
    clientId: row.client_id ?? null,
    clientName: row.client_name ?? null,
    collected: round2(collected.get(row.id) || 0),
  }));
}

// One day's product/extra sales, for the products route.
export async function fetchExtraSalesForDay(
  ymd: string
): Promise<ReportExtraSale[]> {
  const { fromIso, toIso } = getDayRangeIso(ymd);
  const { data, error } = await supabase
    .from("extra_sales")
    .select("*")
    .gte("sold_at", fromIso)
    .lte("sold_at", toIso)
    .order("sold_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
    id: row.id,
    soldAt: row.sold_at,
    category: row.category === "extra" ? "extra" : "product",
    description: row.description || "",
    quantity: Number(row.quantity || 0),
    totalPrice: Number(row.total_price || 0),
    amountPaidCash: Number(row.amount_paid_cash || 0),
    amountPaidMomo: Number(row.amount_paid_momo || 0),
    account: (row.account as MoneyAccount | null) ?? null,
    clientId: row.client_id ?? null,
    clientName: row.client_name ?? null,
  }));
}

// Products sold on credit that still owe money, so the shop can collect later.
export interface UnpaidExtraSale {
  id: string;
  soldAt: string;
  category: "product" | "extra";
  description: string;
  quantity: number;
  totalPrice: number;
  amountPaidCash: number;
  amountPaidMomo: number;
  // null clientName means a walk-in customer.
  clientId: string | null;
  clientName: string | null;
  // Money handed over later, from extra_sale_payments.
  collected: number;
  paid: number;
  balance: number;
}

export async function fetchUnpaidExtraSales(
  beforeIso: string
): Promise<UnpaidExtraSale[]> {
  const { data, error } = await supabase
    .from("extra_sales")
    .select("*")
    .lt("sold_at", beforeIso)
    .order("sold_at", { ascending: true });
  if (error) throw new Error(error.message);
  const sales = (data || []) as any[];
  if (sales.length === 0) return [];

  const collected = new Map<string, number>();
  try {
    const { data: rows } = await supabase
      .from("extra_sale_payments")
      .select("extra_sale_id, amount")
      .in(
        "extra_sale_id",
        sales.map((sale) => sale.id)
      );
    for (const row of (rows || []) as any[]) {
      collected.set(
        row.extra_sale_id,
        (collected.get(row.extra_sale_id) || 0) + Number(row.amount || 0)
      );
    }
  } catch {
    // Migration not run yet: only what was paid at the counter counts.
  }

  return sales
    .map((sale) => {
      const totalPrice = Number(sale.total_price || 0);
      const cash = Number(sale.amount_paid_cash || 0);
      const momo = Number(sale.amount_paid_momo || 0);
      const collectedAmount = collected.get(sale.id) || 0;
      const paid = cash + momo + collectedAmount;
      return {
        id: sale.id,
        soldAt: sale.sold_at,
        category: sale.category === "extra" ? "extra" : "product",
        description: sale.description || "",
        quantity: Number(sale.quantity || 0),
        totalPrice,
        amountPaidCash: round2(cash),
        amountPaidMomo: round2(momo),
        clientId: sale.client_id ?? null,
        clientName: sale.client_name ?? null,
        collected: round2(collectedAmount),
        paid: round2(paid),
        balance: round2(totalPrice - paid),
      } as UnpaidExtraSale;
    })
    .filter((sale) => sale.balance > 0.5);
}

export async function addExtraSalePayment(input: {
  extraSaleId: string;
  amount: number;
  method: "CASH" | "MOMO";
  account?: MoneyAccount | null;
  paidAt: string;
  createdBy?: string;
}): Promise<void> {
  const { error } = await supabase.from("extra_sale_payments").insert({
    extra_sale_id: input.extraSaleId,
    amount: input.amount,
    method: input.method,
    account: input.account || null,
    paid_at: input.paidAt,
    created_by: input.createdBy || null,
  });
  if (error) throw new Error(error.message);
}

export async function addExtraSale(input: {
  soldAt: string;
  category: "product" | "extra";
  description: string;
  quantity: number;
  totalPrice: number;
  amountPaidCash: number;
  amountPaidMomo: number;
  account?: MoneyAccount | null;
  createdBy?: string;
  // Omitted clientName means a walk-in customer.
  clientId?: string | null;
  clientName?: string | null;
}): Promise<void> {
  const row: Record<string, unknown> = {
    sold_at: input.soldAt,
    category: input.category,
    description: input.description,
    quantity: input.quantity,
    total_price: input.totalPrice,
    amount_paid_cash: input.amountPaidCash,
    amount_paid_momo: input.amountPaidMomo,
    account: input.account || null,
    created_by: input.createdBy || null,
  };
  if (input.clientId !== undefined) row.client_id = input.clientId;
  if (input.clientName !== undefined) row.client_name = input.clientName;
  const { error } = await supabase.from("extra_sales").insert(row);
  if (error) throw new Error(error.message);
}
