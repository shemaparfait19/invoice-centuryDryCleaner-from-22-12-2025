"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useSupabaseStore } from "@/lib/supabase-store";
import { formatCurrency, formatTime } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  UNPAID: "Unpaid / On Account",
  CASH: "Cash",
  MOMO: "Mobile Money",
  BANK: "Bank Transfer",
  CARD: "Card Payment",
};

interface InvoiceStatusManagerProps {
  invoice: Invoice;
  showDetails?: boolean;
  compact?: boolean;
}

export function InvoiceStatusManager({
  invoice,
  showDetails = true,
  compact = false,
}: InvoiceStatusManagerProps) {
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<
    "pending" | "completed" | "cancelled" | null
  >(null);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const {
    updateInvoiceStatus,
    updateInvoicePaid,
    addPayment,
    loading,
  } = useSupabaseStore();

  const balanceDue = invoice.balanceDue ?? (invoice.paid ? 0 : invoice.total);
  const amountPaid = invoice.amountPaid ?? (invoice.paid ? invoice.total : 0);
  const payments = invoice.payments ?? [];

  const openRecordPayment = () => {
    setPaymentAmount(balanceDue > 0 ? String(balanceDue) : "");
    setPaymentMethod(invoice.paymentMethod !== "UNPAID" ? invoice.paymentMethod : "CASH");
    setIsRecordingPayment(true);
  };

  const submitPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!(amount > 0)) return;
    setIsSubmittingPayment(true);
    try {
      await addPayment(invoice.id, amount, paymentMethod);
      setIsRecordingPayment(false);
      setPaymentAmount("");
    } catch {
      // Store already surfaced a toast explaining why.
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "cancelled":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const handleStatusChange = (
    status: "pending" | "completed" | "cancelled"
  ) => {
    setNewStatus(status);
    setIsChangingStatus(true);
  };

  const blockedByUnpaidStatus =
    newStatus === "completed" && balanceDue > 0;

  const confirmStatusChange = async () => {
    if (!newStatus || blockedByUnpaidStatus) return;
    try {
      await updateInvoiceStatus(invoice.id, newStatus);
      setIsChangingStatus(false);
      setNewStatus(null);
    } catch {
      // Store already surfaced a toast — just leave the dialog open so
      // the user can see why and go mark it paid.
    }
  };

  const getStatusChangeMessage = () => {
    switch (newStatus) {
      case "completed":
        return "Mark this invoice as completed? This indicates the service has been finished and delivered.";
      case "pending":
        return "Mark this invoice as pending? This indicates the service is still in progress.";
      case "cancelled":
        return "Mark this invoice as cancelled? This action indicates the service was not completed.";
      default:
        return "Are you sure you want to change the status?";
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Badge
          className={`${getStatusColor(
            invoice.status
          )} flex items-center gap-1`}
        >
          {getStatusIcon(invoice.status)}
          {invoice.status.toUpperCase()}
        </Badge>

        <Select onValueChange={handleStatusChange} disabled={loading}>
          <SelectTrigger className="w-32 h-8">
            <SelectValue placeholder="Change..." />
          </SelectTrigger>
          <SelectContent>
            {invoice.status !== "pending" && (
              <SelectItem value="pending">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Pending
                </div>
              </SelectItem>
            )}
            {invoice.status !== "completed" && (
              <SelectItem value="completed">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3" />
                  Completed
                </div>
              </SelectItem>
            )}
            {invoice.status !== "cancelled" && (
              <SelectItem value="cancelled">
                <div className="flex items-center gap-2">
                  <XCircle className="h-3 w-3" />
                  Cancelled
                </div>
              </SelectItem>
            )}
          </SelectContent>
        </Select>

        <AlertDialog open={isChangingStatus} onOpenChange={setIsChangingStatus}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
              <AlertDialogDescription>
                {getStatusChangeMessage()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {blockedByUnpaidStatus && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
                A balance of <strong>{formatCurrency(balanceDue)}</strong> is
                still owed. Record the payment before completing it.
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmStatusChange}
                disabled={blockedByUnpaidStatus}
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Invoice Status</span>
          <Badge
            className={`${getStatusColor(
              invoice.status
            )} flex items-center gap-1`}
          >
            {getStatusIcon(invoice.status)}
            {invoice.status.toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showDetails && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Invoice ID:</span>
              <p className="text-muted-foreground">{invoice.id}</p>
            </div>
            <div>
              <span className="font-medium">Client:</span>
              <p className="text-muted-foreground">{invoice.client.name}</p>
            </div>
            <div>
              <span className="font-medium">Total:</span>
              <p className="text-muted-foreground">
                {formatCurrency(invoice.total)}
              </p>
            </div>
            <div>
              <span className="font-medium">Last Updated:</span>
              <p className="text-muted-foreground">
                {new Date(invoice.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="font-medium">Change Status:</h4>
          <div className="flex gap-2 flex-wrap">
            {invoice.status !== "pending" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange("pending")}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <Clock className="h-4 w-4" />
                Mark Pending
              </Button>
            )}

            {invoice.status !== "completed" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange("completed")}
                disabled={loading}
                className="flex items-center gap-2 text-green-700 border-green-300 hover:bg-green-50"
              >
                <CheckCircle className="h-4 w-4" />
                Mark Completed
              </Button>
            )}

            {invoice.status !== "cancelled" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange("cancelled")}
                disabled={loading}
                className="flex items-center gap-2 text-red-700 border-red-300 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" />
                Mark Cancelled
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Payment:</h4>
            <Badge
              className={
                balanceDue <= 0
                  ? "bg-green-100 text-green-800"
                  : amountPaid > 0
                  ? "bg-blue-100 text-blue-800"
                  : "bg-yellow-100 text-yellow-800"
              }
            >
              {balanceDue <= 0 ? "PAID" : amountPaid > 0 ? "PARTIALLY PAID" : "UNPAID"}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="font-semibold">{formatCurrency(invoice.total)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Paid</p>
              <p className="font-semibold text-green-700">{formatCurrency(amountPaid)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Balance Due</p>
              <p className={`font-semibold ${balanceDue > 0 ? "text-red-700" : "text-green-700"}`}>
                {formatCurrency(balanceDue)}
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {balanceDue > 0 && (
              <Button
                size="sm"
                onClick={openRecordPayment}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <Wallet className="h-4 w-4" />
                Record Payment
              </Button>
            )}
            {amountPaid > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateInvoicePaid(invoice.id, false)}
                disabled={loading}
              >
                Reset to Unpaid
              </Button>
            )}
          </div>

          {payments.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-xs font-medium text-muted-foreground">Payment history</p>
              <div className="space-y-1">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5"
                  >
                    <span>
                      {PAYMENT_METHOD_LABELS[p.method] || p.method}
                      {p.paidByName ? ` · ${p.paidByName}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{formatCurrency(p.amount)}</span>
                      <span className="text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Dialog open={isRecordingPayment} onOpenChange={setIsRecordingPayment}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>
                Balance due: {formatCurrency(balanceDue)}. Enter less than the full
                amount to record a partial payment — the rest stays owed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="payment-amount">Amount</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="payment-method">Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="MOMO">Mobile Money</SelectItem>
                    <SelectItem value="BANK">Bank Transfer</SelectItem>
                    <SelectItem value="CARD">Card Payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={submitPayment}
                disabled={
                  isSubmittingPayment ||
                  !(parseFloat(paymentAmount) > 0) ||
                  parseFloat(paymentAmount) > balanceDue + 1
                }
                className="w-full sm:w-auto"
              >
                {isSubmittingPayment ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {invoice.pickupDate && invoice.pickupTime && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                <strong>Pickup:</strong> {invoice.pickupDate} at{" "}
                {formatTime(invoice.pickupTime)}
              </span>
            </div>
          </div>
        )}

        <AlertDialog open={isChangingStatus} onOpenChange={setIsChangingStatus}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
              <AlertDialogDescription>
                {getStatusChangeMessage()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {blockedByUnpaidStatus && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
                A balance of <strong>{formatCurrency(balanceDue)}</strong> is
                still owed (see the Payment section above) before completing it.
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmStatusChange}
                disabled={blockedByUnpaidStatus}
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Confirm Change
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
