"use client";

// Read/write access to the shop's item list (public.item_catalog) and its
// categories (public.item_categories).
//
// The list is kept in one place: the database. lib/item-catalog.ts holds the
// in-memory copy every sync helper reads, and this module is the only thing
// that changes it, so the report, the invoice form and the products page all
// see the same names and categories.

import { supabase } from "./supabase";
import {
  setCatalogCategories,
  setCatalogItems,
  type CatalogCategory,
  type CatalogItem,
  type CategoryKind,
  type ItemCategory,
} from "./item-catalog";

export const ITEM_CATALOG_SQL = "scripts/add-item-catalog.sql";
export const ITEM_CATEGORIES_SQL = "scripts/add-item-categories.sql";

const TABLE = "item_catalog";
const CATEGORY_TABLE = "item_categories";

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

export interface CategoryRecord {
  id: string;
  key: string;
  name: string;
  countsAs: CategoryKind;
}

export interface CategoryInput {
  name: string;
  countsAs: CategoryKind;
}

// The supabase client is typed with the generated Database interface, which
// does not know about tables added by a script; the cast keeps that out of the
// way without loosening anything else.
const db = supabase as any;

let records: CatalogRecord[] = [];
let categoryRecords: CategoryRecord[] = [];
let loaded = false;
let categoriesLoaded = false;
let missingTable = false;
let missingCategoryTable = false;
let inflight: Promise<CatalogRecord[]> | null = null;

function normalizeKind(value: unknown): CategoryKind {
  return value === "product" || value === "extra" ? value : "dry_cleaning";
}

function normalizeCategory(value: unknown): string {
  const key = String(value || "").trim();
  return key || "dry_cleaning";
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

function toCategoryRecord(row: any): CategoryRecord {
  return {
    id: String(row.id),
    key: String(row.key || ""),
    name: String(row.name || row.key || ""),
    countsAs: normalizeKind(row.counts_as),
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

export function getCategoryRecords(): CategoryRecord[] {
  return categoryRecords;
}

export function itemCatalogLoaded(): boolean {
  return loaded;
}

export function itemCategoriesLoaded(): boolean {
  return categoriesLoaded;
}

export function itemCatalogTableMissing(): boolean {
  return missingTable;
}

export function itemCategoriesTableMissing(): boolean {
  return missingCategoryTable;
}

// Fetch the categories once per page load. force=true re-reads after a change.
export async function loadItemCategories(
  force = false
): Promise<CategoryRecord[]> {
  if (categoriesLoaded && !force) return categoryRecords;

  const { data, error } = await db
    .from(CATEGORY_TABLE)
    .select("id, key, name, counts_as")
    .order("name");

  if (error) {
    const missing = looksMissing(error);
    missingCategoryTable = missing;
    categoriesLoaded = false;
    // Before the categories migration the three built-in categories still
    // work, so the app keeps running on them.
    setCatalogCategories(null);
    return categoryRecords;
  }

  missingCategoryTable = false;
  categoriesLoaded = true;
  categoryRecords = (Array.isArray(data) ? data : []).map(toCategoryRecord);
  setCatalogCategories(
    categoryRecords.map((record) => ({
      key: record.key,
      label: record.name,
      countsAs: record.countsAs,
    }))
  );
  return categoryRecords;
}

// Fetch the list once per page load and hand it to the in-memory registry.
// force=true re-reads after a create/update/delete.
export async function loadItemCatalog(force = false): Promise<CatalogRecord[]> {
  if (loaded && !force) return records;
  if (inflight && !force) return inflight;

  const run = (async () => {
    // Categories decide how each item is counted, so load them first.
    await loadItemCategories(force);

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

function translatedCategory(error: any): Error {
  const message = messageOf(error);
  if (/duplicate key|unique constraint/i.test(message)) {
    return new Error("A category with that name already exists.");
  }
  if (looksMissing(error)) {
    return new Error(
      `The categories table is missing. Run ${ITEM_CATEGORIES_SQL} in Supabase, then refresh.`
    );
  }
  return new Error(message || "The category could not be saved.");
}

function slugify(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "category";
  let key = base;
  let n = 2;
  while (taken.includes(key)) {
    key = `${base}_${n}`;
    n += 1;
  }
  return key;
}

function validateCategory(input: CategoryInput): CategoryInput {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Give the category a name.");
  return { name, countsAs: normalizeKind(input.countsAs) };
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

export async function createItemCategory(
  input: CategoryInput
): Promise<CategoryRecord> {
  const payload = validateCategory(input);
  if (categoryRecords.length === 0) await loadItemCategories(true);
  const key = slugify(
    payload.name,
    categoryRecords.map((record) => record.key)
  );
  const { data, error } = await db
    .from(CATEGORY_TABLE)
    .insert({ key, name: payload.name, counts_as: payload.countsAs })
    .select("id, key, name, counts_as")
    .single();
  if (error) throw translatedCategory(error);
  await loadItemCatalog(true);
  return toCategoryRecord(data);
}

export async function updateItemCategory(
  id: string,
  input: CategoryInput
): Promise<CategoryRecord> {
  const payload = validateCategory(input);
  const { data, error } = await db
    .from(CATEGORY_TABLE)
    .update({ name: payload.name, counts_as: payload.countsAs })
    .eq("id", id)
    .select("id, key, name, counts_as")
    .single();
  if (error) throw translatedCategory(error);
  await loadItemCatalog(true);
  return toCategoryRecord(data);
}

// A category that still has items cannot be deleted, otherwise those items
// would fall back to the report's keyword guesses. Move them first.
export async function deleteItemCategory(record: CategoryRecord): Promise<void> {
  if (categoryRecords.length <= 1) {
    throw new Error("Keep at least one category in the list.");
  }

  const { count, error: countError } = await db
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("category", record.key);
  if (countError) throw translatedCategory(countError);

  if (count && count > 0) {
    throw new Error(
      `${count} item(s) still use ${record.name}. Move them to another category first.`
    );
  }

  const { error } = await db.from(CATEGORY_TABLE).delete().eq("id", record.id);
  if (error) throw translatedCategory(error);
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

// First run for categories: add the three built-ins the app ships with.
export async function importBuiltInCategories(
  categories: CatalogCategory[]
): Promise<number> {
  if (!categories.length) return 0;
  const rows = categories.map((category) => ({
    key: category.key,
    name: category.label,
    counts_as: category.countsAs,
  }));
  const { error } = await db
    .from(CATEGORY_TABLE)
    .upsert(rows, { onConflict: "key", ignoreDuplicates: true });
  if (error) throw translatedCategory(error);
  await loadItemCategories(true);
  return rows.length;
}
