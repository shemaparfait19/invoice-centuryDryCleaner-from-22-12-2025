"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Phone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { LoadingSpinner } from "@/components/loading-spinner";

interface OwedInvoice {
  id: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: string;
  createdAt: string;
}

interface ClientBalance {
  clientId: string;
  name: string;
  phone: string;
  totalOwed: number;
  invoices: OwedInvoice[];
}

export default function AccountsReceivablePage() {
  const [loading, setLoading] = useState(true);
  const [clientBalances, setClientBalances] = useState<ClientBalance[]>([]);

  useEffect(() => {
    const fetchOutstanding = async () => {
      setLoading(true);
      try {
        // Fetch every non-cancelled invoice with its client + payments,
        // paginating past Supabase's 1000-row cap.
        const pageSize = 1000;
        const allRows: any[] = [];
        let page = 0;
        for (;;) {
          const from = page * pageSize;
          const to = from + pageSize - 1;
          const { data, error } = await supabase
            .from("invoices")
            .select("id, total, status, created_at, client:clients(id, name, phone), payments(amount)")
            .neq("status", "cancelled")
            .range(from, to);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < pageSize) break;
          page++;
        }

        const byClient = new Map<string, ClientBalance>();
        for (const row of allRows) {
          if (!row.client) continue;
          const total = parseFloat(row.total);
          const amountPaid = (row.payments || []).reduce(
            (sum: number, p: any) => sum + parseFloat(p.amount),
            0
          );
          const balanceDue = Math.max(0, total - amountPaid);
          if (balanceDue <= 0) continue;

          const key = row.client.id;
          const entry: ClientBalance = byClient.get(key) || {
            clientId: key,
            name: row.client.name,
            phone: row.client.phone,
            totalOwed: 0,
            invoices: [],
          };
          entry.totalOwed += balanceDue;
          entry.invoices.push({
            id: row.id,
            total,
            amountPaid,
            balanceDue,
            status: row.status,
            createdAt: row.created_at,
          });
          byClient.set(key, entry);
        }

        setClientBalances(
          Array.from(byClient.values()).sort((a, b) => b.totalOwed - a.totalOwed)
        );
      } catch (error) {
        console.error("Error loading accounts receivable:", error);
        setClientBalances([]);
      } finally {
        setLoading(false);
      }
    };
    fetchOutstanding();
  }, []);

  const grandTotal = useMemo(
    () => clientBalances.reduce((sum, c) => sum + c.totalOwed, 0),
    [clientBalances]
  );

  return (
    <main className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Accounts Receivable</h1>
          <p className="text-sm text-muted-foreground">
            Clients with an outstanding balance, across all their invoices.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-red-700">
            {formatCurrency(grandTotal)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Clients Owing</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{clientBalances.length}</CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="py-16">
          <LoadingSpinner />
        </div>
      ) : clientBalances.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nobody owes anything right now.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {clientBalances.map((client) => (
            <Card key={client.clientId}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base">{client.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {client.phone}
                    </CardDescription>
                  </div>
                  <Badge className="bg-red-100 text-red-800 text-sm">
                    Owes {formatCurrency(client.totalOwed)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {client.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1.5"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {inv.id}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </span>
                      <span>
                        {formatCurrency(inv.amountPaid)} / {formatCurrency(inv.total)}
                      </span>
                      <span className="font-semibold text-red-700">
                        {formatCurrency(inv.balanceDue)} due
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
