"use client";

import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime, formatTime } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

// The printed invoice is an A4 sheet (210mm wide), which is wider than a
// phone. On small screens the preview shows this summary instead; the PDF
// and desktop preview keep the full invoice layout.
export function InvoiceMobilePreview({ invoice }: { invoice: Invoice }) {
  const amountPaid =
    invoice.amountPaid ?? (invoice.paid ? invoice.total : 0);
  const balanceDue =
    invoice.balanceDue ?? (invoice.paid ? 0 : invoice.total);

  const statusClass =
    invoice.status === "completed"
      ? "bg-green-600 text-white"
      : invoice.status === "pending"
      ? "bg-amber-600 text-white"
      : "bg-red-600 text-white";

  return (
    <div className="sm:hidden space-y-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            {invoice.id}
          </p>
          <p className="text-lg font-semibold break-words">
            {invoice.client.name}
          </p>
          <p className="text-muted-foreground">{invoice.client.phone}</p>
          {invoice.client.address && (
            <p className="text-xs text-muted-foreground break-words">
              {invoice.client.address}
            </p>
          )}
        </div>
        <Badge className={statusClass}>{invoice.status.toUpperCase()}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <p className="col-span-2">Date: {formatDateTime(invoice.createdAt)}</p>
        {invoice.createdByName && <p>By: {invoice.createdByName}</p>}
        <p>Payment: {invoice.paymentMethod}</p>
        {invoice.pickupDate && (
          <p className="col-span-2">
            Pickup: {invoice.pickupDate}
            {invoice.pickupTime ? ` at ${formatTime(invoice.pickupTime)}` : ""}
          </p>
        )}
        {(invoice.hangersBrought !== undefined ||
          invoice.coversBrought !== undefined) && (
          <p className="col-span-2">
            Drop-off — Hangers:{" "}
            {invoice.hangersBrought ? invoice.hangersCount : "None"}, Covers:{" "}
            {invoice.coversBrought ? invoice.coversCount : "None"}
          </p>
        )}
      </div>

      <div className="rounded-md border divide-y">
        {invoice.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-2 p-2.5">
            <div className="min-w-0">
              <p className="font-medium break-words">{item.description}</p>
              <p className="text-xs text-muted-foreground">
                {item.quantity} × {formatCurrency(item.unitPrice)}
              </p>
            </div>
            <p className="font-semibold whitespace-nowrap">
              {formatCurrency(item.totalPrice)}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-md border p-3 space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold">{formatCurrency(invoice.total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Paid</span>
          <span>{formatCurrency(amountPaid)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Balance due</span>
          <span>{formatCurrency(balanceDue)}</span>
        </div>
      </div>

      {invoice.notes && (
        <div className="rounded-md border bg-blue-50 p-3">
          <p className="text-xs font-medium text-blue-800 mb-1">Notes</p>
          <p className="text-blue-700 whitespace-pre-wrap break-words">
            {invoice.notes}
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        The downloaded PDF shows the full invoice layout.
      </p>
    </div>
  );
}
