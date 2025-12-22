"use client";

import { forwardRef } from "react";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

interface InvoicePrintProps {
  invoice: Invoice;
}

export const InvoicePrint = forwardRef<HTMLDivElement, InvoicePrintProps>(
  ({ invoice }, ref) => {
    return (
      <div
        ref={ref}
        className="bg-white text-black min-h-[297mm] w-[210mm] p-6 mx-auto print:p-6 print:m-0 print:w-full print:min-h-full font-sans"
        style={{
          fontSize: "14px",
          lineHeight: "1.4",
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
        }}
      >
        {/* Header */}
        <div className="border-b-4 border-black pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <img
                src="/placeholder-logo.png"
                alt="Company Logo"
                className="mb-2"
                style={{ height: "80px", width: "auto" }}
              />
              <h1
                className="text-4xl font-black tracking-wider mb-2"
                style={{ fontSize: "32px", fontWeight: "900" }}
              >
                INVOICE
              </h1>
              <h2
                className="text-xl font-bold"
                style={{ fontSize: "18px", fontWeight: "700" }}
              >
                Century Dry Cleaner
              </h2>
            </div>
            <div className="text-right">
              <div
                className="text-3xl font-black mb-2"
                style={{ fontSize: "28px", fontWeight: "900" }}
              >
                #{invoice.id}
              </div>
              <div
                className="text-base font-semibold"
                style={{ fontSize: "14px", fontWeight: "600" }}
              >
                <p className="mb-1">
                  Date: {new Date(invoice.createdAt).toLocaleDateString()}
                </p>
                {invoice.createdByName && (
                  <p>Served by: {invoice.createdByName}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Client Information */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <h3
              className="text-lg font-black mb-3 border-b-2 border-black pb-1"
              style={{ fontSize: "16px", fontWeight: "900" }}
            >
              BILL TO:
            </h3>
            <div className="space-y-1">
              <p
                className="font-bold text-lg"
                style={{ fontSize: "16px", fontWeight: "700" }}
              >
                {invoice.client.name}
              </p>
              <p
                className="font-semibold"
                style={{ fontSize: "14px", fontWeight: "600" }}
              >
                {invoice.client.phone}
              </p>
              {invoice.client.address && (
                <p
                  className="font-medium"
                  style={{ fontSize: "13px", fontWeight: "500" }}
                >
                  {invoice.client.address}
                </p>
              )}
            </div>
          </div>
          <div>
            <h3
              className="text-lg font-black mb-3 border-b-2 border-black pb-1"
              style={{ fontSize: "16px", fontWeight: "900" }}
            >
              INVOICE DETAILS:
            </h3>
            <div className="space-y-2">
              <div className="flex items-center">
                <span
                  className="font-bold mr-2"
                  style={{ fontSize: "14px", fontWeight: "700" }}
                >
                  Status:
                </span>
                <span
                  className={`px-3 py-1 rounded-sm text-sm font-bold border-2 ${
                    invoice.status === "completed"
                      ? "bg-white text-black border-black"
                      : invoice.status === "pending"
                      ? "bg-black text-white border-black"
                      : "bg-gray-200 text-black border-black"
                  }`}
                  style={{ fontSize: "12px", fontWeight: "700" }}
                >
                  {invoice.status.toUpperCase()}
                </span>
              </div>
              <p
                className="font-semibold"
                style={{ fontSize: "14px", fontWeight: "600" }}
              >
                <span className="font-bold">Payment:</span>{" "}
                {invoice.paymentMethod}
              </p>
              {invoice.pickupDate && (
                <p
                  className="font-semibold"
                  style={{ fontSize: "14px", fontWeight: "600" }}
                >
                  <span className="font-bold">Pickup Date:</span>{" "}
                  {invoice.pickupDate}
                </p>
              )}
              {invoice.pickupTime && (
                <p
                  className="font-semibold"
                  style={{ fontSize: "14px", fontWeight: "600" }}
                >
                  <span className="font-bold">Pickup Time:</span>{" "}
                  {invoice.pickupTime}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-6">
          <table className="w-full border-collapse border-4 border-black">
            <thead>
              <tr className="bg-black text-white">
                <th
                  className="border-2 border-black px-3 py-3 text-left font-black"
                  style={{ fontSize: "14px", fontWeight: "900" }}
                >
                  DESCRIPTION
                </th>
                <th
                  className="border-2 border-black px-3 py-3 text-center font-black"
                  style={{ fontSize: "14px", fontWeight: "900", width: "80px" }}
                >
                  QTY
                </th>
                <th
                  className="border-2 border-black px-3 py-3 text-right font-black"
                  style={{
                    fontSize: "14px",
                    fontWeight: "900",
                    width: "100px",
                  }}
                >
                  UNIT PRICE
                </th>
                <th
                  className="border-2 border-black px-3 py-3 text-right font-black"
                  style={{
                    fontSize: "14px",
                    fontWeight: "900",
                    width: "100px",
                  }}
                >
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr
                  key={item.id}
                  className={`border-2 border-black ${
                    index % 2 === 0 ? "bg-white" : "bg-gray-100"
                  }`}
                >
                  <td
                    className="border-2 border-black px-3 py-3 font-semibold"
                    style={{ fontSize: "13px", fontWeight: "600" }}
                  >
                    {item.description}
                  </td>
                  <td
                    className="border-2 border-black px-3 py-3 text-center font-bold"
                    style={{ fontSize: "14px", fontWeight: "700" }}
                  >
                    {item.quantity}
                  </td>
                  <td
                    className="border-2 border-black px-3 py-3 text-right font-bold"
                    style={{ fontSize: "13px", fontWeight: "700" }}
                  >
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td
                    className="border-2 border-black px-3 py-3 text-right font-black"
                    style={{ fontSize: "14px", fontWeight: "900" }}
                  >
                    {formatCurrency(item.totalPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total Section */}
        <div className="flex justify-end mb-6">
          <div className="w-80">
            <div className="bg-black text-white p-4 border-4 border-black">
              <div className="flex justify-between items-center">
                <span
                  className="text-2xl font-black"
                  style={{ fontSize: "24px", fontWeight: "900" }}
                >
                  TOTAL:
                </span>
                <span
                  className="text-3xl font-black"
                  style={{ fontSize: "28px", fontWeight: "900" }}
                >
                  {formatCurrency(invoice.total)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mb-6">
            <h3
              className="text-lg font-black mb-3 border-b-2 border-black pb-1"
              style={{ fontSize: "16px", fontWeight: "900" }}
            >
              NOTES:
            </h3>
            <div className="border-2 border-black p-4 bg-gray-50">
              <p
                className="font-semibold"
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  lineHeight: "1.5",
                }}
              >
                {invoice.notes}
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t-4 border-black pt-4 mt-auto">
          <div className="text-center mb-4">
            <p
              className="text-2xl font-black mb-2"
              style={{ fontSize: "20px", fontWeight: "900" }}
            >
              Thank you for your business!
            </p>
          </div>

          <div className="bg-black text-white p-4 text-center">
            <div className="grid grid-cols-1 gap-2">
              <div className="flex justify-center items-center space-x-6 mb-2">
                <span
                  className="font-bold border-2 border-white px-3 py-1 rounded"
                  style={{ fontSize: "14px", fontWeight: "700" }}
                >
                  MOMO CODE: 7722991
                </span>
                <span
                  className="font-bold border-2 border-white px-3 py-1 rounded"
                  style={{ fontSize: "14px", fontWeight: "700" }}
                >
                  Tel: 0783500312
                </span>
              </div>
              <p
                className="font-bold"
                style={{ fontSize: "13px", fontWeight: "700" }}
              >
                Visit www.centurycleaningagency.com to view our cleaning
                services and get quote
              </p>
              <p
                className="font-semibold text-sm mt-2"
                style={{ fontSize: "12px", fontWeight: "600" }}
              >
                For any questions about this invoice, please contact us.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

InvoicePrint.displayName = "InvoicePrint";
