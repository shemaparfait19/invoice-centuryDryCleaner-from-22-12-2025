"use client";

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { Invoice } from "./types";
import { createDateFolder } from "./utils";
import React from "react";
import { createRoot } from "react-dom/client";
import { InvoicePrint } from "@/components/invoice-print";
import { formatCurrency } from "./utils";

export async function generatePDF(invoice: Invoice): Promise<void> {
  try {
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
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
    });

    root.unmount();
    document.body.removeChild(container);

    // Create PDF sized to A4
    const pdf = new jsPDF("p", "mm", "a4");
    const imgWidth = 210;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      0,
      0,
      imgWidth,
      imgHeight
    );

    const dateFolder = createDateFolder();
    const filename = `invoice-${invoice.id}-${dateFolder}.pdf`;
    pdf.save(filename);
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error("Failed to generate PDF");
  }
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
