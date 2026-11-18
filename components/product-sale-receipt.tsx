"use client";

// One product sale written out as a receipt the customer can take away. Printed
// from the products page, downloaded as a PDF, or opened from any sale row.

import { forwardRef } from "react";
import { formatCurrency } from "@/lib/utils";

export type ProductSaleReceiptData = {
  id: string;
  soldAt: string;
  description: string;
  quantity: number;
  totalPrice: number;
  amountPaidCash: number;
  amountPaidMomo: number;
  collected?: number;
  clientName?: string | null;
};

export const ProductSaleReceipt = forwardRef<
  HTMLDivElement,
  { sale: ProductSaleReceiptData }
>(({ sale }, ref) => {
  const collected = sale.collected || 0;
  const paid = sale.amountPaidCash + sale.amountPaidMomo + collected;
  const balance = Math.max(0, sale.totalPrice - paid);
  const unitPrice = sale.quantity
    ? sale.totalPrice / sale.quantity
    : sale.totalPrice;
  const status =
    balance <= 0 ? "PAID" : paid > 0 ? "PARTLY PAID" : "ON CREDIT";

  return (
    <div
      ref={ref}
      className="bg-white text-black w-[210mm] min-h-[148mm] p-8 mx-auto font-sans"
      style={{
        fontSize: "14px",
        lineHeight: "1.4",
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <div className="border-b-4 border-black pb-3 mb-4 flex items-start justify-between">
        <div>
          <h1
            className="font-black tracking-wider"
            style={{ fontSize: "26px", fontWeight: 900 }}
          >
            RECEIPT
          </h1>
          <h2 style={{ fontSize: "18px", fontWeight: 700 }}>
            Century Dry Cleaner
          </h2>
          <p className="text-xs">Products &amp; cleaning supplies</p>
        </div>
        <div className="text-right">
          <div style={{ fontSize: "18px", fontWeight: 700 }}>
            #{sale.id.slice(0, 8).toUpperCase()}
          </div>
          <p style={{ fontSize: "13px", fontWeight: 600 }}>
            Date: {new Date(sale.soldAt).toLocaleDateString()}
          </p>
          <p style={{ fontSize: "13px", fontWeight: 600 }}>
            Time: {new Date(sale.soldAt).toLocaleTimeString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-4">
        <div>
          <h3
            className="border-b-2 border-black pb-1 mb-2"
            style={{ fontSize: "13px", fontWeight: 900 }}
          >
            CUSTOMER:
          </h3>
          <p style={{ fontSize: "15px", fontWeight: 700 }}>
            {sale.clientName || "Walk-in customer"}
          </p>
        </div>
        <div>
          <h3
            className="border-b-2 border-black pb-1 mb-2"
            style={{ fontSize: "13px", fontWeight: 900 }}
          >
            PAYMENT:
          </h3>
          <p style={{ fontSize: "15px", fontWeight: 700 }}>{status}</p>
        </div>
      </div>

      <table className="w-full mb-4" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th
              className="border border-black px-2 py-1 text-left"
              style={{ fontSize: "13px" }}
            >
              Item
            </th>
            <th
              className="border border-black px-2 py-1 text-right"
              style={{ fontSize: "13px" }}
            >
              Qty
            </th>
            <th
              className="border border-black px-2 py-1 text-right"
              style={{ fontSize: "13px" }}
            >
              Unit price
            </th>
            <th
              className="border border-black px-2 py-1 text-right"
              style={{ fontSize: "13px" }}
            >
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1">{sale.description}</td>
            <td className="border border-black px-2 py-1 text-right">
              {sale.quantity}
            </td>
            <td className="border border-black px-2 py-1 text-right">
              {formatCurrency(unitPrice)}
            </td>
            <td className="border border-black px-2 py-1 text-right">
              {formatCurrency(sale.totalPrice)}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="ml-auto w-64 space-y-1">
        <div className="flex justify-between">
          <span>Total</span>
          <span style={{ fontWeight: 700 }}>
            {formatCurrency(sale.totalPrice)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Cash</span>
          <span>{formatCurrency(sale.amountPaidCash)}</span>
        </div>
        <div className="flex justify-between">
          <span>MoMo</span>
          <span>{formatCurrency(sale.amountPaidMomo)}</span>
        </div>
        {collected > 0 && (
          <div className="flex justify-between">
            <span>Collected later</span>
            <span>{formatCurrency(collected)}</span>
          </div>
        )}
        <div
          className="flex justify-between border-t-2 border-black pt-1"
          style={{ fontWeight: 700 }}
        >
          <span>Balance due</span>
          <span>{formatCurrency(balance)}</span>
        </div>
      </div>

      <div className="mt-8 flex items-end justify-between">
        <p className="text-xs">Thank you for your business.</p>
        <div className="min-w-[200px]">
          <p className="text-xs">Served by</p>
          <p className="border-t border-black pt-1">&nbsp;</p>
        </div>
      </div>
    </div>
  );
});

ProductSaleReceipt.displayName = "ProductSaleReceipt";
