"use client";

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { Invoice } from "./types";
import { createDateFolder } from "./utils";
import React from "react";
import { createRoot } from "react-dom/client";
import { InvoicePrint } from "@/components/invoice-print";
import { formatCurrency } from "./utils";

async function buildInvoicePdf(
  invoice: Invoice
): Promise<{ pdf: jsPDF; filename: string }> {
  // Create a temporary container and render the actual InvoicePrint component
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.className = "print-content";
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(React.createElement(InvoicePrint, { invoice }));

  // Wait a tick for layout/fonts
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r))
  );

  const canvas = await html2canvas(container, {
    // 1.5x is plenty sharp for an A4 invoice and keeps the source canvas
    // (and therefore the embedded image) far smaller than a 2x render.
    scale: 1.5,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
  });

  root.unmount();
  document.body.removeChild(container);

  // Create PDF sized to A4, with PDF-level stream compression enabled.
  const pdf = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const imgWidth = 210;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  // JPEG instead of lossless PNG cuts the embedded image from several MB
  // down to a couple hundred KB; quality 0.85 keeps text/borders crisp.
  const imgData = canvas.toDataURL("image/jpeg", 0.85);
  pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight, undefined, "FAST");

  const dateFolder = createDateFolder();
  const safeClientName = invoice.client.name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const nameSegment = safeClientName ? `${safeClientName}-` : "";
  const filename = `invoice-${invoice.id}-${nameSegment}${dateFolder}.pdf`;
  return { pdf, filename };
}

export async function generatePDF(invoice: Invoice): Promise<void> {
  try {
    const { pdf, filename } = await buildInvoicePdf(invoice);
    pdf.save(filename);
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error("Failed to generate PDF");
  }
}

/**
 * Hands the generated PDF straight to the OS share sheet (WhatsApp, Mail,
 * Drive, etc.) via the Web Share API, so it never has to hit the device's
 * Downloads folder first. Falls back to a normal download if the browser
 * doesn't support sharing files (e.g. desktop Firefox/older Safari).
 */
export async function sharePDF(invoice: Invoice): Promise<"shared" | "downloaded"> {
  const { pdf, filename } = await buildInvoicePdf(invoice);
  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  if (
    typeof navigator !== "undefined" &&
    navigator.canShare?.({ files: [file] }) &&
    navigator.share
  ) {
    try {
      await navigator.share({
        files: [file],
        title: `Invoice ${invoice.id}`,
        text: `Invoice ${invoice.id} for ${invoice.client.name}`,
      });
      return "shared";
    } catch (error) {
      // AbortError means the user cancelled the share sheet — not a failure.
      if ((error as DOMException)?.name === "AbortError") {
        return "shared";
      }
      throw error;
    }
  }

  // No file-sharing support on this browser/device — fall back to download.
  pdf.save(filename);
  return "downloaded";
}

export function shareViaWhatsApp(invoice: Invoice): void {
  try {
    const message = `Invoice Details:
📄 Invoice #${invoice.id}
👤 Client: ${invoice.client.name}
💰 Total: ${formatCurrency(invoice.total)}
📅 Date: ${new Date(invoice.createdAt).toLocaleDateString()}
📋 Status: ${invoice.status.toUpperCase()}
💳 Payment: ${invoice.paymentMethod}

Items:
${invoice.items
  .map(
    (item) =>
      `• ${item.description} (${item.quantity}x) - ${formatCurrency(
        item.totalPrice
      )}`
  )
  .join("\n")}

${invoice.notes ? `\nNotes: ${invoice.notes}` : ""}

Thank you for your business! 🙏`;

    const encodedMessage = encodeURIComponent(message);
    const phoneNumber = invoice.client.phone.replace("+", "");
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

    window.open(whatsappUrl, "_blank");
  } catch (error) {
    console.error("Error sharing via WhatsApp:", error);
    throw new Error("Failed to share via WhatsApp");
  }
}
