"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { Wallet, Plus, Trash2, Pencil } from "lucide-react";
import { useSupabaseStore } from "@/lib/supabase-store";
import { formatCurrency } from "@/lib/utils";
import type { Invoice, Payment } from "@/lib/types";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  UNPAID: "Unpaid / On Account",
  SPLIT: "Split",
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
// flipping a label. Solid, saturated colors on purpose — this is the one
// thing on the row staff need to spot at a glance, not a pastel hint.
export function PaymentStatusBadge({
  invoice,
  className = "",
}: {
  invoice: Invoice;
  className?: string;
}) {
  const { balanceDue, amountPaid, percent } = getPaymentFacts(invoice);

  if (balanceDue <= 0) {
    return <Badge className={`bg-green-600 text-white hover:bg-green-600 ${className}`}>Paid</Badge>;
  }
  if (amountPaid > 0) {
    return (
      <Badge className={`bg-blue-600 text-white hover:bg-blue-600 ${className}`}>
        Partial · {percent}%
      </Badge>
    );
  }
  return <Badge className={`bg-orange-500 text-white hover:bg-orange-500 ${className}`}>Unpaid</Badge>;
}

// The actual method(s) money came in on — derived from the real payment
// records, not just the invoice's single paymentMethod label (which reads
// "SPLIT" when more than one was used and doesn't say which).
export function getPaymentMethodsLabel(invoice: Invoice): string {
  const methods = Array.from(new Set((invoice.payments || []).map((p) => p.method)));
  if (methods.length === 0) {
    return invoice.paymentMethod && invoice.paymentMethod !== "UNPAID"
      ? PAYMENT_METHOD_LABELS[invoice.paymentMethod] || invoice.paymentMethod
      : "—";
  }
  return methods.map((m) => PAYMENT_METHOD_LABELS[m] || m).join(" + ");
}

export function PaymentMethodLabel({ invoice, className = "" }: { invoice: Invoice; className?: string }) {
  return <span className={`text-sm text-muted-foreground ${className}`}>{getPaymentMethodsLabel(invoice)}</span>;
}

type PaymentLine = { id: string; amount: string; method: string };

// Records one or more payments toward an invoice in a single dialog — hit
// "Split Payment" to add another line (e.g. part cash, part Mobile Money,
// or pay only part of the balance now and the rest later).
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
  const { addPayments } = useSupabaseStore();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { balanceDue } = getPaymentFacts(invoice);
  if (balanceDue <= 0) return null;

  const openDialog = () => {
    setLines([
      {
        id: "line-1",
        amount: String(balanceDue),
        method: invoice.paymentMethod && !["UNPAID", "SPLIT"].includes(invoice.paymentMethod)
          ? invoice.paymentMethod
          : "CASH",
      },
    ]);
    setOpen(true);
  };

  const addLine = () => {
    const used = new Set(lines.map((l) => l.method));
    const nextMethod = ["CASH", "MOMO", "BANK", "CARD"].find((m) => !used.has(m)) || "CASH";
    setLines((prev) => [...prev, { id: `line-${Date.now()}`, amount: "", method: nextMethod }]);
  };
  const removeLine = (id: string) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  const updateLine = (id: string, patch: Partial<PaymentLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const totalEntered = lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  const canSubmit = totalEntered > 0 && totalEntered <= balanceDue + 1;

  const submit = async () => {
    setSubmitting(true);
    try {
      await addPayments(
        invoice.id,
        lines
          .map((l) => ({ amount: parseFloat(l.amount) || 0, method: l.method }))
          .filter((l) => l.amount > 0)
      );
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
              Balance due: {formatCurrency(balanceDue)}. Add a line for each
              method used — e.g. part cash, part Mobile Money — or enter less
              than the full balance for a partial payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={line.id} className="flex gap-2 items-start">
                <CurrencyInput
                  placeholder="Amount"
                  value={line.amount}
                  onChange={(raw) => updateLine(line.id, { amount: raw })}
                  className="flex-1"
                />
                <Select value={line.method} onValueChange={(v) => updateLine(line.id, { method: v })}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="MOMO">Mobile Money</SelectItem>
                    <SelectItem value="BANK">Bank Transfer</SelectItem>
                    <SelectItem value="CARD">Card Payment</SelectItem>
                  </SelectContent>
                </Select>
                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(line.id)}
                    className="text-red-600 flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Split Payment
            </Button>
            <p
              className={`text-xs font-medium ${
                totalEntered > balanceDue + 1
                  ? "text-red-600"
                  : totalEntered >= balanceDue - 0.01 && totalEntered > 0
                  ? "text-green-700"
                  : "text-muted-foreground"
              }`}
            >
              Entered: {formatCurrency(totalEntered)} of {formatCurrency(balanceDue)} due
            </p>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={submitting || !canSubmit} className="w-full sm:w-auto">
              {submitting ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// One row in a payment history list, with inline edit/remove — correcting
// a mistaken amount or method doesn't require deleting and re-entering.
export function PaymentHistoryRow({
  invoice,
  payment,
}: {
  invoice: Invoice;
  payment: Payment;
}) {
  const { updatePayment, deletePayment } = useSupabaseStore();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState(payment.method);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const openEdit = () => {
    setAmount(String(payment.amount));
    setMethod(payment.method);
    setEditing(true);
  };

  const save = async () => {
    const amt = parseFloat(amount);
    if (!(amt > 0)) return;
    setSaving(true);
    try {
      await updatePayment(invoice.id, payment.id, amt, method);
      setEditing(false);
    } catch {
      // Store already surfaced a toast.
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await deletePayment(invoice.id, payment.id);
    } catch {
      // Store already surfaced a toast.
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5 gap-2">
      <span>
        {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
        {payment.paidByName ? ` · ${payment.paidByName}` : ""}
      </span>
      <span className="flex items-center gap-2 flex-shrink-0">
        <span className="font-semibold">{formatCurrency(payment.amount)}</span>
        <span className="text-muted-foreground">
          {new Date(payment.createdAt).toLocaleDateString()}
        </span>
        <button
          type="button"
          onClick={openEdit}
          className="text-blue-600 hover:text-blue-800"
          title="Edit this payment"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={removing}
          className="text-red-600 hover:text-red-800"
          title="Remove this payment"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </span>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
            <DialogDescription>
              Correct the amount or method recorded on{" "}
              {new Date(payment.createdAt).toLocaleDateString()}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor={`edit-amount-${payment.id}`}>Amount</Label>
              <CurrencyInput id={`edit-amount-${payment.id}`} value={amount} onChange={setAmount} autoFocus />
            </div>
            <div>
              <Label htmlFor={`edit-method-${payment.id}`}>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id={`edit-method-${payment.id}`}>
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
            <Button onClick={save} disabled={saving || !(parseFloat(amount) > 0)} className="w-full sm:w-auto">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
