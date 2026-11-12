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
  type DailyCashReportData,
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
}): Promise<void> {
  const { error } = await supabase.from("extra_sales").insert({
    sold_at: input.soldAt,
    category: input.category,
    description: input.description,
    quantity: input.quantity,
    total_price: input.totalPrice,
    amount_paid_cash: input.amountPaidCash,
    amount_paid_momo: input.amountPaidMomo,
    account: input.account || null,
    created_by: input.createdBy || null,
  });
  if (error) throw new Error(error.message);
}
