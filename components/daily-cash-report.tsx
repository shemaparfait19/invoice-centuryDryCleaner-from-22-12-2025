"use client";

// Daily Cash Report — printed once a day, money only.
//
// Never renders client names, client phone numbers or invoice numbers: the
// report deliberately identifies sales by what was sold, not by who bought it.
// The Excel export is built from the same rows and is equally anonymous.

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Printer,
  RefreshCw,
  Download,
  Plus,
  Wallet,
  TriangleAlert,
} from "lucide-react";
import { useSupabaseStore } from "@/lib/supabase-store";
import { formatCurrency, getLocalDateString } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { MoneyAccount } from "@/lib/types";
import {
  addExtraSale,
  addWithdrawal,
  fetchDailyCashReport,
  parseLocalYmd,
  saveOpeningBalances,
} from "@/lib/daily-cash-report";
import {
  buildReport,
  type DailyCashReportData,
} from "@/lib/daily-cash-report-model";

const ACCOUNT_LABELS: Record<string, string> = {
  cleaner_phone: "Cleaner phone (MoMo)",
  products_phone: "Products phone (MoMo)",
  cash: "Cash",
  unassigned: "Unassigned (MoMo)",
  other: "Other (bank/card)",
};

function formatReportDate(ymd: string): string {
  return parseLocalYmd(ymd).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function DailyCashReport() {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [data, setData] = useState<DailyCashReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const { currentUserName } = useSupabaseStore();

  const load = useCallback(
    async (ymd: string) => {
      setLoading(true);
      try {
        const result = await fetchDailyCashReport(ymd);
        setData(result);
        setLoadedDate(ymd);
      } catch (error: any) {
        setData(null);
        setLoadedDate(null);
        toast({
          title: "Failed to load the daily report",
          description: error?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Auto-load today once, like the Advanced Reports page.
  useEffect(() => {
    load(getLocalDateString());
  }, [load]);

  const model = useMemo(
    () => (data && loadedDate ? buildReport(data, loadedDate) : null),
    [data, loadedDate]
  );

  // --- dialogs ------------------------------------------------------------
  const [openingOpen, setOpeningOpen] = useState(false);
  const [openingCleaner, setOpeningCleaner] = useState("");
  const [openingProducts, setOpeningProducts] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [savingOpening, setSavingOpening] = useState(false);

  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalAccount, setWithdrawalAccount] =
    useState<MoneyAccount>("cash");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalNote, setWithdrawalNote] = useState("");
  const [savingWithdrawal, setSavingWithdrawal] = useState(false);

  const [saleOpen, setSaleOpen] = useState(false);
  const [saleCategory, setSaleCategory] = useState<"product" | "extra">(
    "product"
  );
  const [saleDescription, setSaleDescription] = useState("");
  const [saleQuantity, setSaleQuantity] = useState("1");
  const [saleTotal, setSaleTotal] = useState("");
  const [saleCash, setSaleCash] = useState("");
  const [saleMomo, setSaleMomo] = useState("");
  const [saleAccount, setSaleAccount] = useState<string>("auto");
  const [savingSale, setSavingSale] = useState(false);

  const openOpeningDialog = () => {
    setOpeningCleaner(String(data?.opening?.openingCleanerPhone ?? 0));
    setOpeningProducts(String(data?.opening?.openingProductsPhone ?? 0));
    setOpeningCash(String(data?.opening?.openingCash ?? 0));
    setOpeningOpen(true);
  };

  const submitOpening = async () => {
    if (!loadedDate || !model) return;
    setSavingOpening(true);
    try {
      const closing = {
        cleanerPhone:
          model.accounts.find((a) => a.account === "cleaner_phone")?.balance || 0,
        productsPhone:
          model.accounts.find((a) => a.account === "products_phone")?.balance || 0,
        cash: model.accounts.find((a) => a.account === "cash")?.balance || 0,
      };
      const result = await saveOpeningBalances(
        loadedDate,
        {
          cleanerPhone: parseFloat(openingCleaner) || 0,
          productsPhone: parseFloat(openingProducts) || 0,
          cash: parseFloat(openingCash) || 0,
        },
        closing,
        currentUserName || undefined
      );
      toast({
        title: "Opening balances saved",
        description: result.carriedForward
          ? "Tomorrow's opening balances were prefilled from today's closing balances."
          : "Saved. Existing balances for tomorrow were left untouched.",
      });
      setOpeningOpen(false);
      await load(loadedDate);
    } catch (error: any) {
      toast({
        title: "Could not save opening balances",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingOpening(false);
    }
  };

  const submitWithdrawal = async () => {
    const amount = parseFloat(withdrawalAmount) || 0;
    if (!(amount > 0)) {
      toast({
        title: "Enter a withdrawal amount greater than zero",
        variant: "destructive",
      });
      return;
    }
    setSavingWithdrawal(true);
    try {
      await addWithdrawal({
        withdrawnAt: new Date().toISOString(),
        account: withdrawalAccount,
        amount,
        note: withdrawalNote.trim() || undefined,
        createdBy: currentUserName || undefined,
      });
      toast({ title: `Withdrawal of ${formatCurrency(amount)} recorded` });
      setWithdrawalOpen(false);
      setWithdrawalAmount("");
      setWithdrawalNote("");
      if (loadedDate) await load(loadedDate);
    } catch (error: any) {
      toast({
        title: "Could not record withdrawal",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingWithdrawal(false);
    }
  };

  const submitSale = async () => {
    const quantity = parseInt(saleQuantity, 10) || 0;
    const total = parseFloat(saleTotal) || 0;
    if (!saleDescription.trim() || quantity <= 0 || total <= 0) {
      toast({
        title: "Fill in description, quantity and total price",
        variant: "destructive",
      });
      return;
    }
    setSavingSale(true);
    try {
      await addExtraSale({
        soldAt: new Date().toISOString(),
        category: saleCategory,
        description: saleDescription.trim(),
        quantity,
        totalPrice: total,
        amountPaidCash: parseFloat(saleCash) || 0,
        amountPaidMomo: parseFloat(saleMomo) || 0,
        account:
          saleAccount === "auto" ? null : (saleAccount as MoneyAccount),
        createdBy: currentUserName || undefined,
      });
      toast({ title: `${saleDescription.trim()} recorded` });
      setSaleOpen(false);
      setSaleDescription("");
      setSaleQuantity("1");
      setSaleTotal("");
      setSaleCash("");
      setSaleMomo("");
      setSaleAccount("auto");
      if (loadedDate) await load(loadedDate);
    } catch (error: any) {
      toast({
        title: "Could not record the sale",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingSale(false);
    }
  };

  const exportExcel = () => {
    if (!model || !loadedDate) return;
    const wb = XLSX.utils.book_new();

    const salesSheet = XLSX.utils.json_to_sheet([
      ...model.rows.map((row) => ({
        Items: row.items,
        Qty: row.qty,
        Cash: row.cash,
        MoMo: row.momo,
        Debt: row.debt,
        Total: row.total,
      })),
      {
        Items: "SUBTOTAL",
        Qty: model.rows.reduce((sum, row) => sum + row.qty, 0),
        Cash: model.cashReceived,
        MoMo: model.momoReceived,
        Debt: model.totalDebt,
        Total: model.totalAmount,
      },
    ]);
    XLSX.utils.book_append_sheet(wb, salesSheet, "Sales");

    const totalsSheet = XLSX.utils.aoa_to_sheet([
      ["CENTURY DRY CLEANER - DAILY CASH REPORT"],
      ["Date", formatReportDate(loadedDate)],
      [],
      ["Total cash received", model.cashReceived],
      ["Total MoMo received", model.momoReceived],
      ["Total amount", model.totalAmount],
      ["Total outstanding debt", model.totalDebt],
      ["Total amount received", model.totalReceived],
      ["Pending MoMo (not confirmed)", model.pendingMomo],
      ["Old debt received today", model.oldDebtReceived],
      ["Total withdrawals", model.totalWithdrawals],
      ["Net", model.net],
      ["Check", model.checkPasses ? "PASS" : "DOES NOT MATCH"],
    ]);
    XLSX.utils.book_append_sheet(wb, totalsSheet, "Totals");

    const accountsSheet = XLSX.utils.json_to_sheet(
      model.accounts.map((account) => ({
        Account: ACCOUNT_LABELS[account.account] || account.account,
        Opening: account.opening,
        Received: account.received,
        Withdrawn: account.withdrawn,
        "Balance now": account.balance,
      }))
    );
    XLSX.utils.book_append_sheet(wb, accountsSheet, "By Account");

    const typesSheet = XLSX.utils.json_to_sheet(
      model.byType.map((type) => ({
        Type: type.label,
        Count: type.count,
        Billed: type.billed,
        Received: type.received,
        Unpaid: type.unpaid,
      }))
    );
    XLSX.utils.book_append_sheet(wb, typesSheet, "By Type");

    const withdrawalsSheet = XLSX.utils.json_to_sheet(
      data?.withdrawals.length
        ? data.withdrawals.map((withdrawal) => ({
            Account: ACCOUNT_LABELS[withdrawal.account] || withdrawal.account,
            Note: withdrawal.note || "",
            Amount: withdrawal.amount,
          }))
        : [{ Account: "", Note: "No withdrawals", Amount: 0 }]
    );
    XLSX.utils.book_append_sheet(wb, withdrawalsSheet, "Withdrawals");

    XLSX.writeFile(wb, `century-daily-cash-report-${loadedDate}.xlsx`);
  };

  const reportDate = loadedDate || selectedDate;

  return (
    <div className="min-h-screen bg-background">
      <div className="no-print container mx-auto px-4 py-4 sm:py-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Daily Cash Report</h1>
            <p className="text-sm text-muted-foreground">
              Money received and what was sold. No client details are shown.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40"
            />
            <Button
              onClick={() => load(selectedDate)}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              {loading ? "Loading..." : "Generate Report"}
            </Button>
            <Button
              variant="outline"
              onClick={() => window.print()}
              disabled={!model}
              className="flex items-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              onClick={exportExcel}
              disabled={!model}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Excel
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={openOpeningDialog}>
            <Wallet className="h-4 w-4 mr-2" />
            Opening balances
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setWithdrawalOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Withdrawal
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSaleOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Product / extra sale
          </Button>
        </div>
      </div>

      <div className="print-content container mx-auto px-4 pb-10 space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-lg sm:text-xl font-bold uppercase tracking-wide">
            CENTURY DRY CLEANER – DAILY REPORT
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatReportDate(reportDate)}
          </p>
        </div>

        {!model ? (
          <p className="text-center text-muted-foreground py-10">
            {loading ? "Loading report..." : "Pick a date and generate the report."}
          </p>
        ) : (
          <>
            {/* A. MAIN TABLE */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">A. Sales</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="report-table w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Items</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Cash</th>
                      <th className="text-right p-2">MoMo</th>
                      <th className="text-right p-2">Debt</th>
                      <th className="text-right p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.rows.map((row) => (
                      <tr key={row.key} className="border-b">
                        <td className="p-2">{row.items}</td>
                        <td className="p-2 text-right">{row.qty}</td>
                        <td className="p-2 text-right">
                          {row.cash ? formatCurrency(row.cash) : "—"}
                        </td>
                        <td className="p-2 text-right">
                          {row.momo ? formatCurrency(row.momo) : "—"}
                        </td>
                        <td className="p-2 text-right">
                          {row.debt ? formatCurrency(row.debt) : "—"}
                        </td>
                        <td className="p-2 text-right font-medium">
                          {formatCurrency(row.total)}
                        </td>
                      </tr>
                    ))}
                    {model.rows.length === 0 && (
                      <tr>
                        <td className="p-2 text-muted-foreground" colSpan={6}>
                          No sales recorded for this date.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="p-2">SUBTOTAL</td>
                      <td className="p-2 text-right">
                        {model.rows.reduce((sum, row) => sum + row.qty, 0)}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(model.cashReceived)}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(model.momoReceived)}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(model.totalDebt)}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(model.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>

            {/* B. TOTALS */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">B. Totals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div className="flex justify-between border-b pb-1">
                    <span>Total cash received</span>
                    <span className="font-semibold">
                      {formatCurrency(model.cashReceived)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-1">
                    <span>Total MoMo received</span>
                    <span className="font-semibold">
                      {formatCurrency(model.momoReceived)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-1">
                    <span>Total amount (billed)</span>
                    <span className="font-semibold">
                      {formatCurrency(model.totalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-1">
                    <span>Total outstanding debt</span>
                    <span className="font-semibold">
                      {formatCurrency(model.totalDebt)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-1">
                    <span>Total amount received</span>
                    <span className="font-semibold">
                      {formatCurrency(model.totalReceived)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-1">
                    <span>Pending MoMo (not confirmed)</span>
                    <span className="font-semibold">
                      {formatCurrency(model.pendingMomo)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-1">
                    <span>Old debt received today</span>
                    <span className="font-semibold">
                      {formatCurrency(model.oldDebtReceived)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-1">
                    <span>Total money received today</span>
                    <span className="font-semibold">
                      {formatCurrency(
                        model.totalReceived + model.oldDebtReceived
                      )}
                    </span>
                  </div>
                </div>

                {!model.checkPasses && (
                  <Alert variant="destructive">
                    <TriangleAlert className="h-4 w-4" />
                    <AlertTitle>Totals do not match</AlertTitle>
                    <AlertDescription>
                      Total amount received is{" "}
                      {formatCurrency(model.totalReceived)} but cash + MoMo is{" "}
                      {formatCurrency(
                        model.cashReceived + model.momoReceived
                      )}{" "}
                      (difference {formatCurrency(model.checkDifference)}).
                      <ul className="list-disc pl-5 mt-1 space-y-0.5">
                        {model.checkCauses.map((cause) => (
                          <li key={cause}>{cause}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {model.checkPasses && (
                  <p className="text-xs text-green-700">
                    Check passed: total amount received equals total cash +
                    total MoMo.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* C. MONEY BY ACCOUNT */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">C. Money by account</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="report-table w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Account</th>
                      <th className="text-right p-2">Opening</th>
                      <th className="text-right p-2">Received</th>
                      <th className="text-right p-2">Withdrawn</th>
                      <th className="text-right p-2">Balance now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.accounts.map((account) => (
                      <tr key={account.account} className="border-b">
                        <td className="p-2">
                          {ACCOUNT_LABELS[account.account] || account.account}
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(account.opening)}
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(account.received)}
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(account.withdrawn)}
                        </td>
                        <td className="p-2 text-right font-medium">
                          {formatCurrency(account.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="p-2">TOTAL</td>
                      <td className="p-2 text-right">
                        {formatCurrency(
                          model.accounts.reduce((sum, a) => sum + a.opening, 0)
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(
                          model.accounts.reduce((sum, a) => sum + a.received, 0)
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(
                          model.accounts.reduce((sum, a) => sum + a.withdrawn, 0)
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(
                          model.accounts.reduce((sum, a) => sum + a.balance, 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>

            {/* D. SALES BY TYPE */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">D. Sales by type</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="report-table w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Type</th>
                      <th className="text-right p-2">Count</th>
                      <th className="text-right p-2">Billed</th>
                      <th className="text-right p-2">Received</th>
                      <th className="text-right p-2">Unpaid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.byType.map((type) => (
                      <tr key={type.key} className="border-b">
                        <td className="p-2">{type.label}</td>
                        <td className="p-2 text-right">{type.count}</td>
                        <td className="p-2 text-right">
                          {formatCurrency(type.billed)}
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(type.received)}
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(type.unpaid)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="p-2">TOTAL</td>
                      <td className="p-2 text-right">
                        {model.byType.reduce((sum, t) => sum + t.count, 0)}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(
                          model.byType.reduce((sum, t) => sum + t.billed, 0)
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(
                          model.byType.reduce((sum, t) => sum + t.received, 0)
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(
                          model.byType.reduce((sum, t) => sum + t.unpaid, 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>

            {/* E. OLD DEBT PAYMENTS */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  E. Old debt payments received today
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {model.oldDebtList.length === 0 ? (
                  <p className="text-muted-foreground">
                    None received today.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="report-table w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Time</th>
                            <th className="text-left p-2">Method</th>
                            <th className="text-right p-2">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {model.oldDebtList.map((entry) => (
                            <tr key={entry.key} className="border-b">
                              <td className="p-2">{entry.time}</td>
                              <td className="p-2">
                                {entry.method}
                                {entry.pending ? " — pending confirmation" : ""}
                              </td>
                              <td className="p-2 text-right">
                                {formatCurrency(entry.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 font-semibold">
                            <td className="p-2" colSpan={2}>
                              Received today (confirmed)
                            </td>
                            <td className="p-2 text-right">
                              {formatCurrency(model.oldDebtReceived)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cash {formatCurrency(model.oldDebtCash)} · MoMo{" "}
                      {formatCurrency(model.oldDebtMomo)}
                      {model.oldDebtPending > 0
                        ? ` · Pending ${formatCurrency(model.oldDebtPending)}`
                        : ""}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* F. WITHDRAWALS */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">F. Withdrawals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="report-table w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Account</th>
                        <th className="text-left p-2">Note</th>
                        <th className="text-right p-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.withdrawals.map((withdrawal) => (
                        <tr key={withdrawal.id} className="border-b">
                          <td className="p-2">
                            {ACCOUNT_LABELS[withdrawal.account] ||
                              withdrawal.account}
                          </td>
                          <td className="p-2">{withdrawal.note || "—"}</td>
                          <td className="p-2 text-right">
                            {formatCurrency(withdrawal.amount)}
                          </td>
                        </tr>
                      ))}
                      {!data?.withdrawals.length && (
                        <tr>
                          <td className="p-2 text-muted-foreground" colSpan={3}>
                            No withdrawals recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-semibold">
                        <td className="p-2" colSpan={2}>
                          Total withdrawals
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(model.totalWithdrawals)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                  <span>
                    Net = total money received today (
                    {formatCurrency(model.totalReceived + model.oldDebtReceived)}
                    ) − withdrawals ({formatCurrency(model.totalWithdrawals)})
                  </span>
                  <span>{formatCurrency(model.net)}</span>
                </div>
              </CardContent>
            </Card>

            {/* G. NOTES */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">G. Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {model.notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing unusual for this day.
                  </p>
                ) : (
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {model.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* H. FOOTER */}
            <div className="pt-6 pb-2 text-sm">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                <div className="flex items-end gap-2">
                  <span>Prepared by</span>
                  <span className="inline-block w-48 border-b border-black" />
                </div>
                <div className="flex items-end gap-2">
                  <span>Manager signature</span>
                  <span className="inline-block w-48 border-b border-black" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Opening balances */}
      <Dialog open={openingOpen} onOpenChange={setOpeningOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Opening balances</DialogTitle>
            <DialogDescription>
              Money each account starts the day with ({reportDate}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="opening-cleaner">Cleaner phone</Label>
              <CurrencyInput
                id="opening-cleaner"
                value={openingCleaner}
                onChange={setOpeningCleaner}
              />
            </div>
            <div>
              <Label htmlFor="opening-products">Products phone</Label>
              <CurrencyInput
                id="opening-products"
                value={openingProducts}
                onChange={setOpeningProducts}
              />
            </div>
            <div>
              <Label htmlFor="opening-cash">Cash</Label>
              <CurrencyInput
                id="opening-cash"
                value={openingCash}
                onChange={setOpeningCash}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={submitOpening}
              disabled={savingOpening}
              className="w-full sm:w-auto"
            >
              {savingOpening ? "Saving..." : "Save opening balances"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdrawal */}
      <Dialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record withdrawal</DialogTitle>
            <DialogDescription>
              Money taken out of an account on {reportDate}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Account</Label>
              <Select
                value={withdrawalAccount}
                onValueChange={(value) =>
                  setWithdrawalAccount(value as MoneyAccount)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cleaner_phone">Cleaner phone</SelectItem>
                  <SelectItem value="products_phone">Products phone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="withdrawal-amount">Amount</Label>
              <CurrencyInput
                id="withdrawal-amount"
                value={withdrawalAmount}
                onChange={setWithdrawalAmount}
                placeholder="Amount"
              />
            </div>
            <div>
              <Label htmlFor="withdrawal-note">Note</Label>
              <Input
                id="withdrawal-note"
                value={withdrawalNote}
                onChange={(e) => setWithdrawalNote(e.target.value)}
                placeholder="e.g. owner took cash"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={submitWithdrawal}
              disabled={savingWithdrawal}
              className="w-full sm:w-auto"
            >
              {savingWithdrawal ? "Saving..." : "Save withdrawal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product / extra sale */}
      <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record product / extra sale</DialogTitle>
            <DialogDescription>
              Detergents, hangers, covers, hand wash — sold outside an invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Category</Label>
                <Select
                  value={saleCategory}
                  onValueChange={(value) =>
                    setSaleCategory(value as "product" | "extra")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Product / detergent</SelectItem>
                    <SelectItem value="extra">Extra (hanger, cover...)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sale-qty">Quantity</Label>
                <Input
                  id="sale-qty"
                  inputMode="numeric"
                  value={saleQuantity}
                  onChange={(e) =>
                    setSaleQuantity(e.target.value.replace(/[^0-9]/g, ""))
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="sale-description">Description</Label>
              <Input
                id="sale-description"
                value={saleDescription}
                onChange={(e) => setSaleDescription(e.target.value)}
                placeholder="e.g. Detergent, Hanger"
              />
            </div>
            <div>
              <Label htmlFor="sale-total">Total price</Label>
              <CurrencyInput
                id="sale-total"
                value={saleTotal}
                onChange={setSaleTotal}
                placeholder="Total price"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="sale-cash">Paid cash</Label>
                <CurrencyInput
                  id="sale-cash"
                  value={saleCash}
                  onChange={setSaleCash}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="sale-momo">Paid MoMo</Label>
                <CurrencyInput
                  id="sale-momo"
                  value={saleMomo}
                  onChange={setSaleMomo}
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <Label>Account (optional)</Label>
              <Select value={saleAccount} onValueChange={setSaleAccount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (default rule)</SelectItem>
                  <SelectItem value="products_phone">Products phone</SelectItem>
                  <SelectItem value="cleaner_phone">Cleaner phone</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={submitSale}
              disabled={savingSale}
              className="w-full sm:w-auto"
            >
              {savingSale ? "Saving..." : "Save sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
