"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSupabaseStore } from "@/lib/supabase-store";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import {
  ArrowLeft,
  Phone,
  Clock,
  CheckCircle2,
  User,
  RefreshCw,
} from "lucide-react";

type Urgency = "overdue" | "due-soon" | "today" | "upcoming" | "completed";

function getUrgency(invoice: Invoice, now: Date, pickupAt: Date): Urgency {
  if (invoice.status === "completed") return "completed";
  const diffMs = pickupAt.getTime() - now.getTime();
  if (diffMs < 0) return "overdue";
  if (diffMs <= 2 * 60 * 60 * 1000) return "due-soon";
  if (pickupAt.toDateString() === now.toDateString()) return "today";
  return "upcoming";
}

const URGENCY_META: Record<
  Urgency,
  { border: string; bg: string; badge: string; label: string }
> = {
  overdue: {
    border: "border-l-red-500",
    bg: "bg-red-50",
    badge: "bg-red-100 text-red-800 border-red-300",
    label: "Overdue",
  },
  "due-soon": {
    border: "border-l-orange-500",
    bg: "bg-orange-50",
    badge: "bg-orange-100 text-orange-800 border-orange-300",
    label: "Due Soon",
  },
  today: {
    border: "border-l-amber-400",
    bg: "bg-amber-50",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
    label: "Today",
  },
  upcoming: {
    border: "border-l-blue-400",
    bg: "bg-blue-50",
    badge: "bg-blue-100 text-blue-800 border-blue-300",
    label: "Upcoming",
  },
  completed: {
    border: "border-l-green-500",
    bg: "bg-green-50",
    badge: "bg-green-100 text-green-800 border-green-300",
    label: "Picked Up",
  },
};

export default function PickupSchedulePage() {
  const {
    invoices,
    isInitialized,
    loading,
    initializeDatabase,
    updateInvoiceStatus,
  } = useSupabaseStore();
  const [now, setNow] = useState(new Date());
  const [showCompleted, setShowCompleted] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    initializeDatabase();
  }, [initializeDatabase]);

  // Keep urgency colors current without a full page reload.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const scheduled = useMemo(() => {
    return invoices
      .filter(
        (inv) =>
          inv.pickupDate && inv.pickupTime && inv.status !== "cancelled"
      )
      .filter((inv) => showCompleted || inv.status !== "completed")
      .map((inv) => {
        const pickupAt = new Date(`${inv.pickupDate}T${inv.pickupTime}`);
        return { invoice: inv, pickupAt, urgency: getUrgency(inv, now, pickupAt) };
      })
      .sort((a, b) => a.pickupAt.getTime() - b.pickupAt.getTime());
  }, [invoices, now, showCompleted]);

  const overdueCount = scheduled.filter((s) => s.urgency === "overdue").length;
  const dueSoonCount = scheduled.filter((s) => s.urgency === "due-soon").length;

  const handleMarkPickedUp = async (id: string) => {
    setUpdatingId(id);
    try {
      await updateInvoiceStatus(id, "completed");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading && !isInitialized) {
    return (
      <div className="min-h-screen bg-background">
        <main className="container mx-auto px-4 py-8">
          <LoadingSpinner />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Pickup Schedule</h1>
          </div>
          <div className="flex items-center gap-2">
            {overdueCount > 0 && (
              <Badge className="bg-red-100 text-red-800 border-red-300">
                {overdueCount} overdue
              </Badge>
            )}
            {dueSoonCount > 0 && (
              <Badge className="bg-orange-100 text-orange-800 border-orange-300">
                {dueSoonCount} due soon
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => useSupabaseStore.getState().loadData()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Every scheduled pickup, soonest first. Color shows how urgent it is.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCompleted((v) => !v)}
          >
            {showCompleted ? "Hide" : "Show"} picked-up
          </Button>
        </div>

        {scheduled.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              No scheduled pickups yet. Set a pickup date & time on an invoice
              to see it here.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {scheduled.map(({ invoice, urgency, pickupAt }) => {
              const meta = URGENCY_META[urgency];
              return (
                <Card
                  key={invoice.id}
                  className={`border-l-4 ${meta.border} ${meta.bg}`}
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={meta.badge}>{meta.label}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {invoice.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {invoice.client.name}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        {invoice.client.phone}
                      </div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        {pickupAt.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        at {invoice.pickupTime}
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-2">
                      <span className="font-bold">
                        {formatCurrency(invoice.total)}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            window.open(`tel:${invoice.client.phone}`, "_self")
                          }
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </Button>
                        {urgency !== "completed" && (
                          <Button
                            size="sm"
                            onClick={() => handleMarkPickedUp(invoice.id)}
                            disabled={updatingId === invoice.id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Picked Up
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
