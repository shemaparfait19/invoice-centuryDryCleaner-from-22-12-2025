"use client";

// The downloadable receipt for one product sale. Drawn straight into the PDF
// with jsPDF (text, not a screenshot) so it stays sharp, small, and quick —
// no page rendering involved.

import jsPDF from "jspdf";
import { formatCurrency } from "./utils";
import type { ProductSaleReceiptData } from "@/components/product-sale-receipt";

export function generateProductSalePDF(sale: ProductSaleReceiptData): void {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

  const left = 15;
  const right = 195;
  const collected = sale.collected || 0;
  const paid = sale.amountPaidCash + sale.amountPaidMomo + collected;
  const balance = Math.max(0, sale.totalPrice - paid);
  const unitPrice = sale.quantity
    ? sale.totalPrice / sale.quantity
    : sale.totalPrice;
  const status =
    balance <= 0 ? "PAID" : paid > 0 ? "PARTLY PAID" : "ON CREDIT";

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("RECEIPT", left, 24);
  doc.setFontSize(15);
  doc.text("Century Dry Cleaner", left, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Products & cleaning supplies", left, 37);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`#${sale.id.slice(0, 8).toUpperCase()}`, right, 22, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Date: ${new Date(sale.soldAt).toLocaleDateString()}`, right, 29, {
    align: "right",
  });
  doc.text(`Time: ${new Date(sale.soldAt).toLocaleTimeString()}`, right, 35, {
    align: "right",
  });

  doc.setLineWidth(0.8);
  doc.line(left, 42, right, 42);

  // Customer and payment state
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CUSTOMER", left, 52);
  doc.text("PAYMENT", 110, 52);
  doc.setFont("helvetica", "normal");
  doc.setLineWidth(0.3);
  doc.line(left, 54, 95, 54);
  doc.line(110, 54, right, 54);
  doc.setFontSize(12);
  doc.text(sale.clientName || "Walk-in customer", left, 61);
  doc.setFont("helvetica", "bold");
  doc.text(status, 110, 61);

  // The item
  const tableTop = 72;
  doc.setFontSize(10);
  doc.setFillColor(240, 240, 240);
  doc.rect(left, tableTop, right - left, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.text("Item", left + 2, tableTop + 5.5);
  doc.text("Qty", 130, tableTop + 5.5, { align: "right" });
  doc.text("Unit price", 165, tableTop + 5.5, { align: "right" });
  doc.text("Amount", right - 2, tableTop + 5.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.rect(left, tableTop, right - left, 8 + 9);
  doc.line(left, tableTop + 8, right, tableTop + 8);
  doc.text(sale.description, left + 2, tableTop + 14);
  doc.text(String(sale.quantity), 130, tableTop + 14, { align: "right" });
  doc.text(formatCurrency(unitPrice), 165, tableTop + 14, { align: "right" });
  doc.text(formatCurrency(sale.totalPrice), right - 2, tableTop + 14, {
    align: "right",
  });

  // Money
  let y = tableTop + 28;
  const amountX = right - 2;
  const labelX = 130;
  const line = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, labelX, y, { align: "right" });
    doc.text(value, amountX, y, { align: "right" });
  };
  line("Total", formatCurrency(sale.totalPrice));
  y += 6;
  line("Cash", formatCurrency(sale.amountPaidCash));
  y += 6;
  line("MoMo", formatCurrency(sale.amountPaidMomo));
  y += 6;
  if (collected > 0) {
    line("Collected later", formatCurrency(collected));
    y += 6;
  }
  doc.setLineWidth(0.6);
  doc.line(120, y - 4, right, y - 4);
  line("Balance due", formatCurrency(balance), true);

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Thank you for your business.", left, 150);
  doc.text("Served by", 150, 146);
  doc.setLineWidth(0.3);
  doc.line(150, 154, right, 154);

  doc.save(
    `receipt-${sale.id.slice(0, 8)}-${new Date(sale.soldAt)
      .toISOString()
      .slice(0, 10)}.pdf`
  );
}
