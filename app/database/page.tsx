"use client";

// Database usage, reachable only by opening /database directly — it is not
// linked from the dashboard or the More menu.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DATABASE_LIMIT_BYTES,
  DATABASE_LIMIT_LABEL,
  DATABASE_STATS_SQL,
  DatabaseStatsError,
  formatBytes,
  formatNumber,
  loadDatabaseUsage,
  type DatabaseUsage,
} from "@/lib/database-stats";

export default function DatabasePage() {
  const [usage, setUsage] = useState<DatabaseUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSql, setNeedsSql] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadDatabaseUsage();
      setUsage(data);
      setNeedsSql(false);
    } catch (err: any) {
      setError(err?.message || "The database usage could not be read.");
      setNeedsSql(err instanceof DatabaseStatsError ? err.needsSql : false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sizeBytes = usage?.sizeBytes ?? 0;
  const percent = Math.min(100, (sizeBytes / DATABASE_LIMIT_BYTES) * 100);
  const remaining = Math.max(0, DATABASE_LIMIT_BYTES - sizeBytes);
  const barColor =
    percent >= 90
      ? "bg-red-500"
      : percent >= 70
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 pt-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      <div className="container mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Database usage</h1>
            <p className="text-sm text-muted-foreground">
              Supabase database size against the {DATABASE_LIMIT_LABEL}{" "}
              allowance.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      <div className="container mx-auto space-y-4 px-4 pb-10">
        {error && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">
              {needsSql
                ? "Database usage is not set up yet."
                : "Could not read the database usage."}
            </p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">Database size</p>
              <p className="text-3xl font-bold">
                {loading && !usage ? "—" : formatBytes(sizeBytes)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatBytes(remaining)} free of {DATABASE_LIMIT_LABEL}
            </p>
          </div>

          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.max(percent, sizeBytes > 0 ? 1 : 0)}%` }}
            />
          </div>

          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{percent.toFixed(1)}% used</span>
            <span>{DATABASE_LIMIT_LABEL} limit</span>
          </div>
        </div>

        {usage && usage.tables.length > 0 && (
          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-base font-semibold">Tables</p>
              <p className="text-xs text-muted-foreground">
                Sizes include indexes · rows are approximate
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted text-left">
                    <th className="border-b px-4 py-2 font-medium">Table</th>
                    <th className="border-b px-4 py-2 font-medium">Rows</th>
                    <th className="border-b px-4 py-2 font-medium">Size</th>
                    <th className="border-b px-4 py-2 font-medium">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.tables.map((table) => {
                    const share =
                      sizeBytes > 0 ? (table.sizeBytes / sizeBytes) * 100 : 0;
                    return (
                      <tr key={table.name} className="border-b last:border-b-0">
                        <td className="px-4 py-2 font-mono text-xs sm:text-sm">
                          {table.name}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {formatNumber(table.rowEstimate)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          {formatBytes(table.sizeBytes)}
                        </td>
                        <td className="w-40 px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-slate-500"
                                style={{ width: `${Math.max(share, 1)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {share.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Sizes come from Supabase itself. If the project is not on the free
          plan, set NEXT_PUBLIC_SUPABASE_DB_LIMIT_MB so the bar matches your
          allowance. Setup script: {DATABASE_STATS_SQL}.
        </p>
      </div>
    </div>
  );
}
