"use client";

// Reads the database usage numbers from the database_stats() function
// (scripts/add-database-stats.sql). The normal API key cannot read system
// size information, so the function is the only way the page can see it.

import { supabase } from "./supabase";

export const DATABASE_STATS_SQL = "scripts/add-database-stats.sql";

// Supabase Free plan database allowance. Override with
// NEXT_PUBLIC_SUPABASE_DB_LIMIT_MB if the project is on another plan.
const LIMIT_MB =
  Number(process.env.NEXT_PUBLIC_SUPABASE_DB_LIMIT_MB) || 500;

export const DATABASE_LIMIT_BYTES = LIMIT_MB * 1024 * 1024;
export const DATABASE_LIMIT_LABEL = `${LIMIT_MB} MB`;

export interface TableUsage {
  name: string;
  sizeBytes: number;
  rowEstimate: number;
}

export interface DatabaseUsage {
  sizeBytes: number;
  tables: TableUsage[];
}

const db = supabase as any;

export class DatabaseStatsError extends Error {
  needsSql: boolean;

  constructor(message: string, needsSql: boolean) {
    super(message);
    this.name = "DatabaseStatsError";
    this.needsSql = needsSql;
  }
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function loadDatabaseUsage(): Promise<DatabaseUsage> {
  const { data, error } = await db.rpc("database_stats");

  if (error) {
    const message = String(error.message || error.details || "");
    const missing = /could not find the function|function .* does not exist|schema cache/i.test(
      message
    );
    throw new DatabaseStatsError(
      missing
        ? `The database_stats() function is not set up. Run ${DATABASE_STATS_SQL} in Supabase, then press Refresh.`
        : message || "The database usage could not be read.",
      missing
    );
  }

  const payload = (Array.isArray(data) ? data[0] : data) || {};
  const tables = Array.isArray(payload.tables) ? payload.tables : [];

  return {
    sizeBytes: toNumber(payload.database_size_bytes),
    tables: tables
      .map((row: any) => ({
        name: String(row?.name || ""),
        sizeBytes: toNumber(row?.size_bytes),
        rowEstimate: toNumber(row?.row_estimate),
      }))
      .filter((row: TableUsage) => row.name)
      .sort((a: TableUsage, b: TableUsage) => b.sizeBytes - a.sizeBytes),
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / Math.pow(1024, index);
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}
