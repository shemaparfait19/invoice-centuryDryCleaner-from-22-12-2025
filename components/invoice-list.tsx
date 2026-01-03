"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Download,
  Share,
  Eye,
  StickyNote,
} from "lucide-react";
import { useSupabaseStore } from "@/lib/supabase-store";
import { formatCurrency } from "@/lib/utils";
import { generatePDF, shareViaWhatsApp } from "@/lib/pdf-utils";
import { InvoicePrint } from "@/components/invoice-print";
import { toast } from "@/hooks/use-toast";
import type { Invoice } from "@/lib/types";
import { InvoiceStatusManager } from "@/components/invoice-status-manager";

interface InvoiceListProps {
  onEdit: (invoiceId: string) => void;
}

export function InvoiceList({ onEdit }: InvoiceListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchingDb, setIsSearchingDb] = useState(false);
  const [searchResults, setSearchResults] = useState<Invoice[]>([]);
  const [isSearchingLoading, setIsSearchingLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paidFilter, setPaidFilter] = useState<string>("all");
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [notesInvoice, setNotesInvoice] = useState<Invoice | null>(null);
  const [notesText, setNotesText] = useState("");

  // IntersectionObserver for infinite scroll
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const {
    invoices,
    deleteInvoice,
    loading,
    updateInvoicePaid,
    updateInvoicePaymentMethod,
    updateInvoice,
    loadMoreInvoices,
    allInvoicesLoaded,
    isLoadingMore,
    searchInvoicesDb,
  } = useSupabaseStore();

  const activeInvoices = isSearchingDb ? searchResults : invoices;

  const filteredInvoices = activeInvoices
    .filter((invoice) => {
      const matchesSearch = isSearchingDb
        ? true
        : invoice.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          invoice.client.phone.includes(searchTerm) ||
          invoice.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || invoice.status === statusFilter;
      const matchesPaid =
        paidFilter === "all" ||
        (paidFilter === "paid" ? invoice.paid : !invoice.paid);

      return matchesSearch && matchesStatus && matchesPaid;
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  // Setup IntersectionObserver for infinite scroll
  useEffect(() => {
    if (isSearchingDb) {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      return;
    }

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !allInvoicesLoaded && !isLoadingMore) {
          loadMoreInvoices();
        }
      },
      {
        threshold: 0.1,
        rootMargin: "100px",
      }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [allInvoicesLoaded, isLoadingMore, isSearchingDb, loadMoreInvoices]);

  const handleDbSearch = async () => {
    const q = searchTerm.trim();
    if (!q) {
      setIsSearchingDb(false);
      setSearchResults([]);
      return;
    }

    try {
      setIsSearchingLoading(true);
      setIsSearchingDb(true);
      const results = await searchInvoicesDb(q);
      setSearchResults(results);
    } catch (error: any) {
      toast({
        title: "Search failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearchingLoading(false);
    }
  };

  const clearDbSearch = () => {
    setIsSearchingDb(false);
    setSearchResults([]);
    setSearchTerm("");
  };

  const handleDelete = async (invoiceId: string) => {
    try {
      await deleteInvoice(invoiceId);
      setDeleteInvoiceId(null);
      toast({ title: "Invoice deleted successfully!" });
    } catch (error) {
      toast({
        title: "Error deleting invoice",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadPDF = async (invoice: Invoice) => {
    try {
      await generatePDF(invoice);
      toast({ title: "PDF downloaded successfully!" });
    } catch (error) {
      toast({
        title: "Error generating PDF",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleShareWhatsApp = async (invoice: Invoice) => {
    try {
      await shareViaWhatsApp(invoice);
      toast({ title: "Opening WhatsApp..." });
    } catch (error) {
      toast({
        title: "Error sharing invoice",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleOpenNotes = (invoice: Invoice) => {
    setNotesInvoice(invoice);
    setNotesText(invoice.notes || "");
  };

  const handleSaveNotes = async () => {
    if (!notesInvoice) return;

    try {
      await updateInvoice(notesInvoice.id, { notes: notesText.trim() || null });
      setNotesInvoice(null);
      setNotesText("");
      toast({ title: "Notes updated successfully!" });
    } catch (error) {
      toast({
        title: "Error updating notes",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col space-y-4">
        <h1 className="text-xl sm:text-2xl font-bold">All Invoices</h1>
        <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleDbSearch();
                }
              }}
              className="pl-10 w-full"
            />
          </div>
          <Button
            onClick={handleDbSearch}
            disabled={isSearchingLoading}
            className="w-full sm:w-auto"
          >
            {isSearchingLoading ? "Searching..." : "Search"}
          </Button>
          {isSearchingDb && (
            <Button
              variant="outline"
              onClick={clearDbSearch}
              className="w-full sm:w-auto"
            >
              Clear
            </Button>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paidFilter} onValueChange={setPaidFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Filter by payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            Invoices ({filteredInvoices.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Mobile view - Card layout */}
          <div className="block sm:hidden space-y-4">
            {filteredInvoices.map((invoice) => (
              <div key={invoice.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="font-mono text-sm text-muted-foreground">
                      {invoice.id}
                    </p>
                    <p className="font-medium">{invoice.client.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {invoice.client.phone}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {formatCurrency(invoice.total)}
                    </p>
                    <Badge className={getStatusColor(invoice.status)}>
                      {invoice.status}
                    </Badge>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  <p>
                    Date: {new Date(invoice.createdAt).toLocaleDateString()}
                  </p>
                  <p>Created by: {invoice.createdByName || "-"}</p>
                </div>

                {/* Invoice Items Display - Mobile */}
                {invoice.items && invoice.items.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3 -mx-2">
                    <p className="text-sm font-medium text-gray-700 mb-2">Items ({invoice.items.length}):</p>
                    <div className="space-y-1">
                      {invoice.items.slice(0, 3).map((item) => (
                        <div key={item.id} className="flex justify-between text-xs">
                          <span className="truncate flex-1">{item.description}</span>
                          <span className="ml-2 font-medium">
                            {item.quantity} × {formatCurrency(item.unitPrice)}
                          </span>
                        </div>
                      ))}
                      {invoice.items.length > 3 && (
                        <p className="text-xs text-muted-foreground italic">
                          +{invoice.items.length - 3} more items
                        </p>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Debug: Show if no items */}
                {(!invoice.items || invoice.items.length === 0) && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 -mx-2">
                    <p className="text-sm text-red-600 font-medium">No items found (Debug)</p>
                  </div>
                )}

                {/* Floating Notes Display */}
                {invoice.notes && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 -mx-2">
                    <div className="flex items-start gap-2">
                      <StickyNote className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800 mb-1">
                          Notes & Updates
                        </p>
                        <p className="text-sm text-blue-700">{invoice.notes}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Select
                    value={invoice.paymentMethod}
                    onValueChange={(val) =>
                      updateInvoicePaymentMethod(invoice.id, val)
                    }
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue placeholder="Method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNPAID">Unpaid</SelectItem>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="MOMO">Mobile Money</SelectItem>
                      <SelectItem value="BANK">Bank Transfer</SelectItem>
                      <SelectItem value="CARD">Card Payment</SelectItem>
                    </SelectContent>
                  </Select>

                  <button
                    className={`text-xs px-2 py-1 rounded border ${
                      invoice.paid
                        ? "border-green-300 text-green-700"
                        : "border-yellow-300 text-yellow-700"
                    }`}
                    onClick={() => updateInvoicePaid(invoice.id, !invoice.paid)}
                  >
                    {invoice.paid ? "Paid" : "Unpaid"}
                  </button>
                </div>

                <div className="pt-2 border-t">
                  <InvoiceStatusManager
                    invoice={invoice}
                    compact={true}
                    showDetails={false}
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewInvoice(invoice)}
                    className="flex-1 sm:flex-none"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(invoice.id)}
                    className="flex-1 sm:flex-none"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadPDF(invoice)}
                    className="flex-1 sm:flex-none"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleShareWhatsApp(invoice)}
                    className="flex-1 sm:flex-none"
                  >
                    <Share className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenNotes(invoice)}
                    className="flex-1 sm:flex-none"
                  >
                    <StickyNote className="h-4 w-4 mr-2" />
                    Notes
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteInvoiceId(invoice.id)}
                    className="flex-1 sm:flex-none"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop view - Table layout */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4">Invoice ID</th>
                  <th className="text-left p-4">Client</th>
                  <th className="text-left p-4">Date</th>
                  <th className="text-left p-4">Created By</th>
                  <th className="text-left p-4">Amount</th>
                  <th className="text-left p-4">Status</th>
                  <th className="text-left p-4">Payment</th>
                  <th className="text-left p-4">Notes</th>
                  <th className="text-right p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => (
                  <>
                    <tr key={invoice.id} className="border-b hover:bg-muted/50">
                      <td className="p-4 font-mono text-sm">{invoice.id}</td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium">{invoice.client.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {invoice.client.phone}
                          </p>
                        </div>
                      </td>
                      <td className="p-4">
                        {new Date(invoice.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {invoice.createdByName || "-"}
                      </td>
                      <td className="p-4 font-semibold">
                        {formatCurrency(invoice.total)}
                      </td>
                      <td className="p-4">
                        <Badge className={getStatusColor(invoice.status)}>
                          {invoice.status}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Select
                            value={invoice.paymentMethod}
                            onValueChange={(val) =>
                              updateInvoicePaymentMethod(invoice.id, val)
                            }
                          >
                            <SelectTrigger className="w-36 h-8">
                              <SelectValue placeholder="Method" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="UNPAID">
                                Unpaid / On Account
                              </SelectItem>
                              <SelectItem value="CASH">Cash</SelectItem>
                              <SelectItem value="MOMO">Mobile Money</SelectItem>
                              <SelectItem value="BANK">
                                Bank Transfer
                              </SelectItem>
                              <SelectItem value="CARD">Card Payment</SelectItem>
                            </SelectContent>
                          </Select>
                          <button
                            className={`text-xs px-2 py-1 rounded border ${
                              invoice.paid
                                ? "border-green-300 text-green-700"
                                : "border-yellow-300 text-yellow-700"
                            }`}
                            onClick={() =>
                              updateInvoicePaid(invoice.id, !invoice.paid)
                            }
                          >
                            {invoice.paid ? "Paid" : "Unpaid"}
                          </button>
                        </div>
                      </td>
                      <td className="p-4">
                        {invoice.notes && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 max-w-xs">
                            <div className="flex items-start gap-2">
                              <StickyNote className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-blue-800 mb-1">
                                  Notes
                                </p>
                                <p
                                  className="text-xs text-blue-700 truncate"
                                  title={invoice.notes}
                                >
                                  {invoice.notes}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setViewInvoice(invoice)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onEdit(invoice.id)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDownloadPDF(invoice)}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleShareWhatsApp(invoice)}
                            >
                              <Share className="h-4 w-4 mr-2" />
                              Share WhatsApp
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleOpenNotes(invoice)}
                            >
                              <StickyNote className="h-4 w-4 mr-2" />
                              Notes
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteInvoiceId(invoice.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                    <tr
                      key={`${invoice.id}-status`}
                      className="border-b bg-gray-50/50"
                    >
                      <td colSpan={9} className="p-2">
                        <InvoiceStatusManager
                          invoice={invoice}
                          compact={true}
                          showDetails={false}
                        />
                      </td>
                    </tr>
                    {/* Invoice Items Row */}
                    {invoice.items && invoice.items.length > 0 && (
                      <tr key={`${invoice.id}-items`} className="border-b bg-gray-25">
                        <td colSpan={9} className="p-3 bg-gray-50">
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-700 mb-2">Invoice Items:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {invoice.items.map((item) => (
                                <div key={item.id} className="flex justify-between text-xs bg-white p-2 rounded border">
                                  <span className="truncate flex-1 font-medium">{item.description}</span>
                                  <span className="ml-2 text-gray-600">
                                    {item.quantity} × {formatCurrency(item.unitPrice)} = {formatCurrency(item.totalPrice)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {filteredInvoices.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No invoices found matching your criteria.
            </div>
          )}

          {/* Infinite Scroll Trigger */}
          {filteredInvoices.length > 0 && !isSearchingDb && (
            <div ref={loadMoreRef} className="py-4">
              {isLoadingMore && (
                <div className="flex justify-center items-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-sm text-muted-foreground">Loading more invoices...</span>
                </div>
              )}
              {allInvoicesLoaded && filteredInvoices.length > 0 && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  All invoices loaded
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteInvoiceId}
        onOpenChange={() => setDeleteInvoiceId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              invoice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteInvoiceId && handleDelete(deleteInvoiceId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invoice View Dialog */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Invoice Preview</h2>
              <Button variant="ghost" onClick={() => setViewInvoice(null)}>
                ×
              </Button>
            </div>
            <div className="p-4">
              <InvoicePrint invoice={viewInvoice} />
            </div>
          </div>
        </div>
      )}

      {/* Notes Dialog */}
      {notesInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Invoice Notes</h2>
              <p className="text-sm text-muted-foreground">
                Invoice #{notesInvoice.id} - {notesInvoice.client.name}
              </p>
            </div>
            <div className="p-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Notes & Updates
                  </label>
                  <textarea
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    placeholder="Add notes like: Client didn't pay all money, delivery delayed, special instructions..."
                    className="w-full p-3 border rounded-lg resize-none"
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use this to track important updates, payment issues, or
                    special instructions.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setNotesInvoice(null);
                  setNotesText("");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button onClick={handleSaveNotes} className="flex-1">
                Save Notes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
