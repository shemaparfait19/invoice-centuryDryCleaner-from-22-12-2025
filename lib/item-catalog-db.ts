"use client";

// Read/write access to the shop's item list (public.item_catalog).
//
// The list is kept in one place: the database. lib/item-catalog.ts holds the
// in-memory copy every sync helper reads, and this module is the only thing
// that changes it, so the report, the invoice form and the products page all
// see the same names and categories.

import { supabase } from "./supabase";
import {
  setCatalogItems,
  type CatalogItem,
  type ItemCategory,
} from "./item-catalog";

export const ITEM_CATALOG_SQL = "scripts/add-item-catalog.sql";

const TABLE = "item_catalog";

export interface CatalogRecord {
  id: string;
  name: string;
  category: ItemCategory;
  aliases: string[];
}

export interface CatalogItemInput {
  name: string;
  category: ItemCategory;
  aliases: string[];
}

// The supabase client is typed with the generated Database interface, which
// does not know about tables added by a script; the cast keeps that out of the
// way without loosening anything else.
const db = supabase as any;

let records: CatalogRecord[] = [];
let loaded = false;
let missingTable = false;
let inflight: Promise<CatalogRecord[]> | null = null;

function normalizeCategory(value: unknown): ItemCategory {
  return value === "product" || value === "extra" ? value : "dry_cleaning";
}

function toRecord(row: any): CatalogRecord {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    category: normalizeCategory(row.category),
    aliases: Array.isArray(row.aliases)
      ? row.aliases.map((alias: unknown) => String(alias)).filter(Boolean)
      : [],
  };
}

function messageOf(error: any): string {
  return String(error?.message || error?.details || "");
}

function looksMissing(error: any): boolean {
  return /relation .* does not exist|does not exist|schema cache|could not find the table/i.test(
    messageOf(error)
  );
}

export function getCatalogRecords(): CatalogRecord[] {
  return records;
}

export function itemCatalogLoaded(): boolean {
  return loaded;
}

export function itemCatalogTableMissing(): boolean {
  return missingTable;
}

// Fetch the list once per page load and hand it to the in-memory registry.
// force=true re-reads after a create/update/delete.
export async function loadItemCatalog(force = false): Promise<CatalogRecord[]> {
  if (loaded && !force) return records;
  if (inflight && !force) return inflight;

  const run = (async () => {
    const { data, error } = await db
      .from(TABLE)
      .select("id, name, category, aliases")
      .order("name");

    if (error) {
      missingTable = looksMissing(error);
      loaded = false;
      return records;
    }

    missingTable = false;
    loaded = true;
    records = (Array.isArray(data) ? data : []).map(toRecord);
    if (records.length > 0) {
      setCatalogItems(
        records.map((record) => ({
          name: record.name,
          category: record.category,
          aliases: record.aliases,
        }))
      );
    } else {
      // Nothing saved yet: keep the built-in list so the shop can still work.
      setCatalogItems(null);
    }
    return records;
  })();

  inflight = run;
  try {
    return await run;
  } finally {
    if (inflight === run) inflight = null;
  }
}

function cleanAliases(input: string[] | string | undefined): string[] {
  const list = Array.isArray(input)
    ? input
    : String(input || "").split(",");
  return Array.from(
    new Set(
      list
        .map((alias) => String(alias).trim())
        .filter(Boolean)
    )
  );
}

function validate(input: CatalogItemInput): CatalogItemInput {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Give the item a name.");
  return {
    name,
    category: normalizeCategory(input.category),
    aliases: cleanAliases(input.aliases),
  };
}

function translated(error: any): Error {
  const message = messageOf(error);
  if (/duplicate key|unique constraint/i.test(message)) {
    return new Error("An item with that name is already in the list.");
  }
  if (looksMissing(error)) {
    return new Error(
      `The item list table is missing. Run ${ITEM_CATALOG_SQL} in Supabase, then refresh.`
    );
  }
  return new Error(message || "The item list could not be saved.");
}

export async function createCatalogItem(
  input: CatalogItemInput
): Promise<CatalogRecord> {
  const payload = validate(input);
  const { data, error } = await db
    .from(TABLE)
    .insert(payload)
    .select("id, name, category, aliases")
    .single();
  if (error) throw translated(error);
  await loadItemCatalog(true);
  return toRecord(data);
}

export async function updateCatalogItem(
  id: string,
  input: CatalogItemInput
): Promise<CatalogRecord> {
  const payload = validate(input);
  const { data, error } = await db
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select("id, name, category, aliases")
    .single();
  if (error) throw translated(error);
  await loadItemCatalog(true);
  return toRecord(data);
}

export async function deleteCatalogItem(id: string): Promise<void> {
  const { error } = await db.from(TABLE).delete().eq("id", id);
  if (error) throw translated(error);
  await loadItemCatalog(true);
}

// First run: copy the built-in list into the table so everything is editable.
// Existing names are left alone.
export async function importBuiltInCatalog(
  items: CatalogItem[]
): Promise<number> {
  if (!items.length) return 0;
  const rows = items.map((item) => ({
    name: item.name.trim(),
    category: normalizeCategory(item.category),
    aliases: cleanAliases(item.aliases || []),
  }));
  const { error } = await db
    .from(TABLE)
    .upsert(rows, { onConflict: "name", ignoreDuplicates: true });
  if (error) throw translated(error);
  await loadItemCatalog(true);
  return rows.length;
}
