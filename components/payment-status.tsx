"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Wallet } from "lucide-react";
import { useSupabaseStore } from "@/lib/supabase-store";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  UNPAID: "Unpaid / On Account",
  CASH: "Cash",
  MOMO: "Mobile Money",
  BANK: "Bank Transfer",
  CARD: "Card Payment",
};

function getPaymentFacts(invoice: Invoice) {
  const total = invoice.total || 0;
  const amountPaid = invoice.amountPaid ?? (invoice.paid ? total : 0);
  const balanceDue = invoice.balanceDue ?? Math.max(0, total - amountPaid);
  const percent = total > 0 ? Math.round((amountPaid / total) * 100) : balanceDue <= 0 ? 100 : 0;
  return { total, amountPaid, balanceDue, percent };
}

// A fact, not a switch — computed from the invoice's actual recorded
// payments, so there's nothing here to misclick. To change payment status,
// use RecordPaymentButton, which records a real payment instead of just
// flipping a label.
export function PaymentStatusBadge({
  invoice,
  className = "",
}: {
  invoice: Invoice;
  className?: string;
}) {
  const { balanceDue, amountPaid, percent } = getPaymentFacts(invoice);

  if (balanceDue <= 0) {
    return <Badge className={`bg-green-100 text-green-800 ${className}`}>Paid</Badge>;
  }
  if (amountPaid > 0) {
    return (
      <Badge className={`bg-blue-100 text-blue-800 ${className}`}>
        Partial · {percent}%
      </Badge>
    );
  }
  return <Badge className={`bg-yellow-100 text-yellow-800 ${className}`}>Unpaid</Badge>;
}

// Records one payment toward an invoice — any amount up to the balance, in
// any method. Call it again (even with a different method) to split a
// payment across cash + Mobile Money, or across today + later.
export function RecordPaymentButton({
  invoice,
  size = "sm",
  variant = "outline",
  label = "Record Payment",
}: {
  invoice: Invoice;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
  label?: string;
}) {
  const { addPayment } = useSupabaseStore();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [submitting, setSubmitting] = useState(false);

  const { balanceDue } = getPaymentFacts(invoice);
  if (balanceDue <= 0) return null;

  const openDialog = () => {
    setAmount(String(balanceDue));
    setMethod(invoice.paymentMethod && invoice.paymentMethod !== "UNPAID" ? invoice.paymentMethod : "CASH");
    setOpen(true);
  };

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!(amt > 0)) return;
    setSubmitting(true);
    try {
      await addPayment(invoice.id, amt, method);
      setOpen(false);
    } catch {
      // Store already surfaced a toast explaining why.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        size={size}
        variant={variant}
        onClick={openDialog}
        className="flex items-center gap-1.5"
      >
        <Wallet className="h-3.5 w-3.5" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment — {invoice.id}</DialogTitle>
            <DialogDescription>
              Balance due: {formatCurrency(balanceDue)}. Enter less than the
              full amount to record a partial payment (the rest stays owed),
              or come back and record another payment with a different
              method — e.g. part cash, part Mobile Money.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor={`amount-${invoice.id}`}>Amount</Label>
              <Input
                id={`amount-${invoice.id}`}
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor={`method-${invoice.id}`}>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id={`method-${invoice.id}`}>
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
              onClick={submit}
              disabled={
                submitting || !(parseFloat(amount) > 0) || parseFloat(amount) > balanceDue + 1
              }
              className="w-full sm:w-auto"
            >
              {submitting ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
