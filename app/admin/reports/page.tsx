"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";

export default function AdminReports() {
  const [range, setRange] = useState<"today" | "7d" | "weekly" | "30d" | "custom" | "all">("7d");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [customStartDate, setCustomStartDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split("T")[0]
  );
  const [customEndDate, setCustomEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const now = new Date();
      let from: string | null = null;
      let to: string | null = null;
      
      if (range === "today")
        from = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        ).toISOString();
      if (range === "7d")
        from = new Date(now.getTime() - 7 * 86400000).toISOString();
      if (range === "weekly") {
        // Get Monday of current week
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        from = new Date(now.setDate(diff)).toISOString();
      }
      if (range === "30d")
        from = new Date(now.getTime() - 30 * 86400000).toISOString();
      if (range === "custom") {
        from = new Date(customStartDate).toISOString();
        const endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);
        to = endDate.toISOString();
      }

      // Fetch ALL invoices with pagination to avoid Supabase row limit
      const pageSize = 1000;
      const allInvoices: any[] = [];
      let page = 0;

      try {
        for (;;) {
          const fromRange = page * pageSize;
          const toRange = fromRange + pageSize - 1;
          
          let query = supabase
            .from("invoices")
            .select("*")
            .order("created_at", { ascending: false })
            .range(fromRange, toRange);
            
          if (from) query = query.gte("created_at", from);
          if (to) query = query.lte("created_at", to);
          
          const { data, error } = await query;
          
          if (error) {
            console.error("Error fetching invoices:", error);
            break;
          }
          
          if (!data || data.length === 0) break;
          
          allInvoices.push(...data);
          
          // If we got less than pageSize, we've reached the end
          if (data.length < pageSize) break;
          
          page++;
        }
        
        setRows(allInvoices);
        console.log(`Admin Reports: Loaded ${allInvoices.length} invoices with pagination`);
      } catch (error) {
        console.error("Error in admin reports fetch:", error);
        setRows([]);
      }

      // Fetch clients and items for Excel export
      const { data: clientsData } = await supabase.from("clients").select("*");
      setClients(clientsData || []);

      const { data: itemsData } = await supabase.from("invoice_items").select("*");
      setItems(itemsData || []);

      setLoading(false);
    };
    fetchData();
  }, [range, customStartDate, customEndDate]);

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
    const completed = rows.filter((r) => r.status === "completed").length;
    const pending = rows.filter((r) => r.status === "pending").length;
    return { total, completed, pending, count: rows.length };
  }, [rows]);

  const downloadExcel = () => {
    // Create workbook
    const wb = XLSX.utils.book_new();

    // Main Report Sheet - Simple flat format
    const mainReportData: any[] = [];
    const invoiceIds = rows.map((r) => r.id);
    const filteredItems = items.filter((item) =>
      invoiceIds.includes(item.invoice_id)
    );

    rows.forEach((r) => {
      const client = clients.find((c) => c.id === r.client_id);
      const invoiceItems = filteredItems.filter(
        (item) => item.invoice_id === r.id
      );

      if (invoiceItems.length > 0) {
        invoiceItems.forEach((item) => {
          mainReportData.push({
            "Date": new Date(r.created_at).toLocaleDateString(),
            "Name": client?.name || "N/A",
            "Tel Number": client?.phone || "N/A",
            "Address": client?.address || "N/A",
            "Service Description": item.description,
            "Quantity": item.quantity,
            "Unit Price": Number(item.unit_price || 0),
            "Item Total": Number(item.total_price || 0),
            "Invoice Total": Number(r.total || 0),
            "Paid": r.paid ? "Paid" : "Not Paid",
            "Payment Method": r.payment_method,
            "Status": r.status === "completed" ? "Completed" : r.status === "pending" ? "Pending" : "Cancelled",
            "Pickup Date": r.pickup_date || "N/A",
            "Pickup Time": r.pickup_time || "N/A",
            "Invoice ID": r.id,
            "Notes": r.notes || "",
          });
        });
      } else {
        mainReportData.push({
          "Date": new Date(r.created_at).toLocaleDateString(),
          "Name": client?.name || "N/A",
          "Tel Number": client?.phone || "N/A",
          "Address": client?.address || "N/A",
          "Service Description": "No items",
          "Quantity": 0,
          "Unit Price": 0,
          "Item Total": 0,
          "Invoice Total": Number(r.total || 0),
          "Paid": r.paid ? "Paid" : "Not Paid",
          "Payment Method": r.payment_method,
          "Status": r.status === "completed" ? "Completed" : r.status === "pending" ? "Pending" : "Cancelled",
          "Pickup Date": r.pickup_date || "N/A",
          "Pickup Time": r.pickup_time || "N/A",
          "Invoice ID": r.id,
          "Notes": r.notes || "",
        });
      }
    });

    const mainSheet = XLSX.utils.json_to_sheet(mainReportData);
    XLSX.utils.book_append_sheet(wb, mainSheet, "Report");

    // Summary Sheet
    const summaryData = [
      ["Century Dry Cleaner - Admin Report"],
      ["Period", range.toUpperCase()],
      ["Generated", new Date().toLocaleString()],
      [""],
      ["Total Revenue", totals.total],
      ["Total Invoices", totals.count],
      ["Completed", totals.completed],
      ["Pending", totals.pending],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

    // Write file
    const dateStr = range === "custom" 
      ? `${customStartDate}_to_${customEndDate}`
      : new Date().toISOString().split("T")[0];
    const filename = `century-admin-report-${range}-${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  return (
    <main className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Detailed Reports</h1>
        <div className="flex items-center gap-2">
          <Button
            variant={range === "today" ? "default" : "outline"}
            onClick={() => setRange("today")}
          >
            Today
          </Button>
          <Button
            variant={range === "7d" ? "default" : "outline"}
            onClick={() => setRange("7d")}
          >
            7 days
          </Button>
          <Button
            variant={range === "weekly" ? "default" : "outline"}
            onClick={() => setRange("weekly")}
          >
            This Week
          </Button>
          <Button
            variant={range === "30d" ? "default" : "outline"}
            onClick={() => setRange("30d")}
          >
            30 days
          </Button>
          <Button
            variant={range === "custom" ? "default" : "outline"}
            onClick={() => setRange("custom")}
          >
            Custom Range
          </Button>
          <Button
            variant={range === "all" ? "default" : "outline"}
            onClick={() => setRange("all")}
          >
            All
          </Button>
          <Button onClick={downloadExcel}>Download Excel</Button>
        </div>
      </div>

      {range === "custom" && (
        <Card>
          <CardHeader>
            <CardTitle>Select Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="w-full sm:w-auto">
                <label className="text-sm font-medium mb-2 block">From Date</label>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label className="text-sm font-medium mb-2 block">To Date</label>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>{formatCurrency(totals.total)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent>{totals.count}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Completed</CardTitle>
          </CardHeader>
          <CardContent>{totals.completed}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending</CardTitle>
          </CardHeader>
          <CardContent>{totals.pending}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Raw exportable data</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            "Loading..."
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-2">ID</th>
                    <th className="p-2">Client</th>
                    <th className="p-2">Total</th>
                    <th className="p-2">Method</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.id}</td>
                      <td className="p-2">{r.client_id}</td>
                      <td className="p-2">
                        {formatCurrency(Number(r.total || 0))}
                      </td>
                      <td className="p-2">{r.payment_method}</td>
                      <td className="p-2">{r.status}</td>
                      <td className="p-2">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
