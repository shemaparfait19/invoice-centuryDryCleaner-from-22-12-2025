"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Banknote, Download, Share, Eye, RefreshCw, User } from "lucide-react";
import { useSupabaseStore } from "@/lib/supabase-store";
import { formatCurrency } from "@/lib/utils";
import { generatePDF, shareViaWhatsApp } from "@/lib/pdf-utils";
import { InvoicePrint } from "@/components/invoice-print";
import { InvoiceStatusManager } from "@/components/invoice-status-manager";
import { toast } from "@/hooks/use-toast";
import type { Invoice } from "@/lib/types";

const LIMIT_OPTIONS = [50, 100, 200, 500] as const;
type LimitOption = (typeof LIMIT_OPTIONS)[number];

const GROUP_ORDER = ["Today", "Yesterday", "This Week", "Earlier"];

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  if (date >= todayStart) return "Today";
  if (date >= yesterdayStart) return "Yesterday";
  if (date >= weekStart) return "This Week";
  return "Earlier";
}

interface RecentCompletedProps {
  type: "completed" | "paid";
  onEdit: (invoiceId: string) => void;
}

export function RecentCompleted({ type, onEdit }: RecentCompletedProps) {
  const { fetchRecentCompleted, invoices } = useSupabaseStore();
  const [results, setResults] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState<LimitOption>(50);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);

  const load = useCallback(async (lim: LimitOption) => {
    setLoading(true);
    const data = await fetchRecentCompleted(type, lim);
    setResults(data);
    setLoading(false);
  }, [fetchRecentCompleted, type]);

  useEffect(() => {
    load(limit);
  }, [load, limit]);

  // Sync with store real-time updates
  useEffect(() => {
    if (results.length === 0) return;
    setResults((prev) =>
      prev
        .map((item) => invoices.find((inv) => inv.id === item.id) ?? item)
        .filter((inv) =>
          type === "completed" ? inv.status === "completed" : inv.paid
        )
    );
  }, [invoices]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownloadPDF = async (invoice: Invoice) => {
    try {
      await generatePDF(invoice);
      toast({ title: "PDF downloaded successfully!" });
    } catch {
      toast({ title: "Error generating PDF", variant: "destructive" });
    }
  };

  const handleShareWhatsApp = async (invoice: Invoice) => {
    try {
      await shareViaWhatsApp(invoice);
    } catch {
      toast({ title: "Error sharing invoice", variant: "destructive" });
    }
  };

  const groups: Record<string, Invoice[]> = {};
  for (const inv of results) {
    const label = getDateGroup(inv.updatedAt ?? inv.createdAt);
    if (!groups[label]) groups[label] = [];
    groups[label].push(inv);
  }

  const getPaymentBadge = (invoice: Invoice) => {
    if (!invoice.paid)
      return <Badge variant="outline" className="border-yellow-300 text-yellow-700">Unpaid</Badge>;
    const labels: Record<string, string> = {
      CASH: "Cash", MOMO: "Mobile Money", BANK: "Bank Transfer",
      CARD: "Card", UNPAID: "Unpaid",
    };
    return (
      <Badge variant="outline" className="border-green-300 text-green-700">
        {labels[invoice.paymentMethod] ?? invoice.paymentMethod}
      </Badge>
    );
  };

  const getActor = (invoice: Invoice) => {
    if (type === "completed") return invoice.completedByName ?? invoice.completedByPhone ?? null;
    return invoice.paidByName ?? invoice.paidByPhone ?? null;
  };

  const isCompleted = type === "completed";
  const Icon = isCompleted ? CheckCircle2 : Banknote;
  const accentColor = isCompleted ? "text-green-600" : "text-blue-600";
  const spinnerColor = isCompleted ? "border-green-600" : "border-blue-600";
  const title = isCompleted ? "Completed Invoices" : "Paid Invoices";
  const description = isCompleted
    ? "Invoices with status set to Completed — ordered by most recently updated."
    : "Invoices marked as Paid — ordered by most recently updated.";
  const emptyText = isCompleted ? "No completed invoices yet." : "No paid invoices yet.";

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-6 w-6 ${accentColor}`} />
          <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
          {!loading && (
            <span className="text-sm text-muted-foreground">
              ({results.length}{results.length === limit ? "+" : ""})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Show:</span>
          <Select
            value={String(limit)}
            onValueChange={(v) => setLimit(Number(v) as LimitOption)}
          >
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMIT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} rows
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => load(limit)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${spinnerColor}`} />
        </div>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {emptyText}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {GROUP_ORDER.filter((g) => groups[g]?.length > 0).map((group) => (
            <div key={group} className="space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1">
                {group} — {groups[group].length} invoice{groups[group].length !== 1 ? "s" : ""}
              </h2>

              {/* Desktop table */}
              <div className="hidden sm:block">
                <Card>
                  <CardContent className="p-0">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-gray-50 text-left text-xs text-muted-foreground">
                          <th className="p-3">Invoice</th>
                          <th className="p-3">Client</th>
                          <th className="p-3">{isCompleted ? "Completed at" : "Paid at"}</th>
                          <th className="p-3">{isCompleted ? "Completed by" : "Paid by"}</th>
                          <th className="p-3">Amount</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Payment</th>
                          <th className="p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups[group].map((invoice) => (
                          <React.Fragment key={invoice.id}>
                            <tr
                              className="border-b hover:bg-muted/50 cursor-pointer"
                              onClick={() => setViewInvoice(invoice)}
                            >
                              <td className="p-3 font-mono text-sm">{invoice.id}</td>
                              <td className="p-3">
                                <p className="font-medium">{invoice.client.name}</p>
                                <p className="text-xs text-muted-foreground">{invoice.client.phone}</p>
                              </td>
                              <td className="p-3 text-sm text-muted-foreground">
                                {new Date(invoice.updatedAt ?? invoice.createdAt).toLocaleString()}
                              </td>
                              <td className="p-3">
                                {getActor(invoice) ? (
                                  <span className="flex items-center gap-1 text-sm font-medium text-gray-700">
                                    <User className="h-3 w-3 text-muted-foreground" />
                                    {getActor(invoice)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="p-3 font-semibold">{formatCurrency(invoice.total)}</td>
                              <td className="p-3">
                                <Badge
                                  className={
                                    invoice.status === "completed"
                                      ? "bg-green-100 text-green-800"
                                      : invoice.status === "cancelled"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-yellow-100 text-yellow-800"
                                  }
                                >
                                  {invoice.status}
                                </Badge>
                              </td>
                              <td className="p-3">{getPaymentBadge(invoice)}</td>
                              <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => setViewInvoice(invoice)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => handleDownloadPDF(invoice)}>
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => handleShareWhatsApp(invoice)}>
                                    <Share className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            <tr className="border-b bg-gray-50/50">
                              <td colSpan={8} className="p-2">
                                <InvoiceStatusManager invoice={invoice} compact={true} showDetails={false} />
                              </td>
                            </tr>
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>

              {/* Mobile cards */}
              <div className="block sm:hidden space-y-3">
                {groups[group].map((invoice) => (
                  <Card key={invoice.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-xs text-muted-foreground">{invoice.id}</p>
                          <p className="font-semibold">{invoice.client.name}</p>
                          <p className="text-sm text-muted-foreground">{invoice.client.phone}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="font-bold">{formatCurrency(invoice.total)}</p>
                          <Badge
                            className={
                              invoice.status === "completed"
                                ? "bg-green-100 text-green-800"
                                : invoice.status === "cancelled"
                                ? "bg-red-100 text-red-800"
                                : "bg-yellow-100 text-yellow-800"
                            }
                          >
                            {invoice.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(invoice.updatedAt ?? invoice.createdAt).toLocaleString()}</span>
                        {getPaymentBadge(invoice)}
                      </div>
                      {getActor(invoice) && (
                        <div className="flex items-center gap-1 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                          <User className="h-3 w-3" />
                          <span className="font-medium">
                            {isCompleted ? "Completed by" : "Paid by"}:
                          </span>
                          <span>{getActor(invoice)}</span>
                        </div>
                      )}
                      <InvoiceStatusManager invoice={invoice} compact={true} showDetails={false} />
                      <div className="flex gap-2 pt-1 border-t">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setViewInvoice(invoice)}>
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDownloadPDF(invoice)}>
                          <Download className="h-4 w-4 mr-1" /> PDF
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => handleShareWhatsApp(invoice)}>
                          <Share className="h-4 w-4 mr-1" /> Share
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invoice View Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Invoice Details</h2>
              <Button variant="ghost" onClick={() => setViewInvoice(null)}>×</Button>
            </div>
            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InvoicePrint invoice={viewInvoice} />
              <InvoiceStatusManager invoice={viewInvoice} showDetails={true} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
