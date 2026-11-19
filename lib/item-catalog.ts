// The shop's item list.
//
// The list lives in the database (public.item_catalog) and is edited from
// /items, so staff can add anything the shop handles and say whether it is
// laundry, a product, or an extra. lib/item-catalog.json is the built-in
// starting list used until the table has rows (and as a fallback if the
// migration has not been run yet).
//
// Everything here is synchronous and reads the in-memory registry, so the daily
// report and the invoice form can keep using plain functions; call
// loadItemCatalog() (lib/item-catalog-db.ts) once on a page before relying on
// the DB contents.

import catalog from "./item-catalog.json";

// A category key: the value stored on each item, e.g. "dry_cleaning".
export type ItemCategory = string;

// What a category counts as on the daily report. Categories are editable, but
// they always behave like one of these three.
export type CategoryKind = "dry_cleaning" | "product" | "extra";

export interface CatalogItem {
  name: string;
  category: ItemCategory;
  aliases?: string[];
}

export interface CatalogCategory {
  key: string;
  label: string;
  countsAs: CategoryKind;
}

export const CATEGORY_KINDS: {
  key: CategoryKind;
  label: string;
  hint: string;
}[] = [
  {
    key: "dry_cleaning",
    label: "Dry cleaning (clothes)",
    hint: "Counted in the clothes table on the daily report.",
  },
  {
    key: "product",
    label: "Product sold",
    hint: "Printed under Products on the daily report.",
  },
  {
    key: "extra",
    label: "Extra (hangers, covers...)",
    hint: "Printed under Products too, but kept separate from the shop's products.",
  },
];

const BUILT_IN_ITEMS: CatalogItem[] = (catalog as { items: CatalogItem[] })
  .items;

export const BUILT_IN_CATEGORIES: CatalogCategory[] = [
  { key: "dry_cleaning", label: "Dry cleaning", countsAs: "dry_cleaning" },
  { key: "product", label: "Product", countsAs: "product" },
  { key: "extra", label: "Extra", countsAs: "extra" },
];

function normalizeKind(value: unknown): CategoryKind {
  return value === "product" || value === "extra" ? value : "dry_cleaning";
}

function normalizeCategory(value: unknown): string {
  const key = String(value || "").trim();
  return key || "dry_cleaning";
}

// The list in use right now: the database rows once loaded, otherwise the
// built-in JSON list.
let liveItems: CatalogItem[] = BUILT_IN_ITEMS;
let liveCategories: CatalogCategory[] = BUILT_IN_CATEGORIES;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let canonical = new Map<string, string>();
let categories = new Map<string, ItemCategory>();
// Every name and alias, longest first. Used when a line says more than the
// item name alone, e.g. "NIL containers" still belongs to Container.
let phrases: { phrase: string; name: string; category: ItemCategory }[] = [];

// Products first, then extras: that is the order the /products dropdown shows.
export const PRODUCT_ITEM_NAMES: string[] = [];
export const ALL_ITEM_NAMES: string[] = [];

function rebuild() {
  canonical = new Map();
  categories = new Map();
  phrases = [];
  PRODUCT_ITEM_NAMES.length = 0;
  ALL_ITEM_NAMES.length = 0;

  for (const item of liveItems) {
    const name = (item.name || "").trim();
    if (!name) continue;
    const category = normalizeCategory(item.category);
    canonical.set(normalize(name), name);
    categories.set(normalize(name), category);
    phrases.push({ phrase: normalize(name), name, category });
    for (const alias of item.aliases || []) {
      const key = normalize(alias);
      if (!key) continue;
      if (!canonical.has(key)) canonical.set(key, name);
      if (!categories.has(key)) categories.set(key, category);
      phrases.push({ phrase: key, name, category });
    }
    ALL_ITEM_NAMES.push(name);
  }

  // Longest phrase wins, so "bed cover" beats "cover" inside a longer line.
  phrases.sort((a, b) => b.phrase.length - a.phrase.length);

  for (const item of liveItems) {
    if (categoryKind(item.category) === "product" && item.name.trim()) {
      PRODUCT_ITEM_NAMES.push(item.name.trim());
    }
  }
  for (const item of liveItems) {
    if (categoryKind(item.category) === "extra" && item.name.trim()) {
      PRODUCT_ITEM_NAMES.push(item.name.trim());
    }
  }
}

rebuild();

// Called by the loader after the database rows arrive. Pass null/[] to fall
// back to the built-in list.
export function setCatalogItems(items: CatalogItem[] | null): void {
  liveItems = items && items.length > 0 ? items : BUILT_IN_ITEMS;
  rebuild();
}

// Called by the category loader. Pass null/[] to fall back to the built-ins.
export function setCatalogCategories(
  categories: CatalogCategory[] | null
): void {
  liveCategories =
    categories && categories.length > 0 ? categories : BUILT_IN_CATEGORIES;
  rebuild();
}

export function getCatalogCategories(): CatalogCategory[] {
  return liveCategories;
}

export function getBuiltInCategories(): CatalogCategory[] {
  return BUILT_IN_CATEGORIES;
}

export function isUsingBuiltInCategories(): boolean {
  return liveCategories === BUILT_IN_CATEGORIES;
}

// The label to print for a stored category key. Unknown keys are shown as-is,
// so an item never disappears because its category was renamed.
export function categoryLabel(key: string): string {
  return liveCategories.find((category) => category.key === key)?.label || key;
}

// How a category counts on the report. Legacy keys map to themselves; a key we
// have never seen is treated as clothes so no money goes missing.
export function categoryKind(key: string): CategoryKind {
  const known = liveCategories.find((category) => category.key === key);
  return known ? known.countsAs : normalizeKind(key);
}

export function getCatalogItems(): CatalogItem[] {
  return liveItems;
}

export function getBuiltInCatalogItems(): CatalogItem[] {
  return BUILT_IN_ITEMS;
}

export function isUsingBuiltInCatalog(): boolean {
  return liveItems === BUILT_IN_ITEMS;
}

// The catalog item named somewhere inside a longer line: "NIL containers" →
// Container, "blue bed cover" → Bed cover. Only whole words count. A clothes
// match is preferred when the line also names a product, so "shirt and hanger"
// stays a clothes line.
function matchPhrase(
  label: string
): { name: string; category: ItemCategory } | null {
  const key = normalize(label);
  if (!key) return null;
  const padded = ` ${key} `;
  let fallback: { name: string; category: ItemCategory } | null = null;
  for (const entry of phrases) {
    if (!entry.phrase || !padded.includes(` ${entry.phrase} `)) continue;
    const found = { name: entry.name, category: entry.category };
    if (categoryKind(entry.category) === "dry_cleaning") return found;
    if (!fallback) fallback = found;
  }
  return fallback;
}

// "trouser" → "Pants", "bed cover" → "Bed cover". Anything not in the list is
// kept exactly as typed, so a one-off item is never lost.
export function canonicalItemName(label: string): string {
  const key = normalize(label);
  return canonical.get(key) || matchPhrase(label)?.name || label.trim();
}

// The catalog's own name for a label, or null when it is not in the list. The
// daily report uses this to give every known item its own printed row instead
// of sweeping it into "Other Clothes".
export function lookupItemName(label: string): string | null {
  return canonical.get(normalize(label)) || matchPhrase(label)?.name || null;
}

// What the shop says this thing is. null means the list has never heard of it,
// so the report falls back to its keyword guesses.
export function lookupItemCategory(label: string): ItemCategory | null {
  return categories.get(normalize(label)) || matchPhrase(label)?.category || null;
}

// Suggestions for the typing dropdown: names starting with the query first,
// then names (or aliases) that merely contain it.
export function searchItemCatalog(query: string, limit = 8): string[] {
  const q = normalize(query);
  if (!q) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const item of liveItems) {
    const name = normalize(item.name);
    if (name.startsWith(q)) starts.push(item.name);
    else if (
      name.includes(q) ||
      (item.aliases || []).some((alias) => normalize(alias).includes(q))
    ) {
      contains.push(item.name);
    }
  }
  return [...starts, ...contains].slice(0, limit);
}

// One invoice line sometimes lists several garments with their quantities,
// e.g. "Shirt x4, Underpants x5, Socks x3". The daily report needs those as
// separate rows, so this pulls the line apart.
export interface ParsedItemLine {
  name: string;
  quantity: number;
}

// "Shirt x4" / "Shirt x 4" / "Shirt×4" / "Shirt*4" / "Shirt (4)", and
// "4 Shirt" / "4x Shirt". Plain "Box 3" is deliberately not a match.
const QTY_SUFFIX = /^(.+?)\s+[x×*]\s*(\d+(?:[.,]\d+)?)$/i;
const QTY_SUFFIX_TIGHT = /^(.+?)\s*[×*]\s*(\d+(?:[.,]\d+)?)$/i;
const QTY_PAREN = /^(.+?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*\)$/;
const QTY_PREFIX = /^(\d+(?:[.,]\d+)?)\s*[x×]?\s+(.+)$/i;

function toNumber(value: string): number {
  return Number(value.replace(",", "."));
}

// Split on commas / semicolons / newlines / "+", but never inside brackets,
// so "Suit Washing (Jacket, Complete)" stays one piece.
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    const isSeparator =
      depth === 0 && (char === "," || char === ";" || char === "\n");
    const isPlus =
      depth === 0 && char === "+" && /\s/.test(text[i - 1] || " ") && /\s/.test(text[i + 1] || " ");
    if (isSeparator || isPlus) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function withQuantity(segment: string): ParsedItemLine | null {
  const clean = segment.trim().replace(/[.!]+$/, "").trim();
  for (const pattern of [QTY_SUFFIX, QTY_SUFFIX_TIGHT, QTY_PAREN]) {
    const match = pattern.exec(clean);
    if (match && match[1].trim() && /[a-z]/i.test(match[1])) {
      return { name: match[1].trim(), quantity: toNumber(match[2]) };
    }
  }
  const prefix = QTY_PREFIX.exec(clean);
  if (prefix && /[a-z]/i.test(prefix[2]) && !/^\d/.test(prefix[2].trim())) {
    return { name: prefix[2].trim(), quantity: toNumber(prefix[1]) };
  }
  return null;
}

// Returns null when the text is a single item (nothing to split).
export function parseItemLine(text: string): ParsedItemLine[] | null {
  const segments = splitTopLevel(text || "");
  if (segments.length === 0) return null;
  const parsed = segments.map(withQuantity);

  if (segments.length === 1) {
    const only = parsed[0];
    if (!only) return null;
    // "Shirt x4" with a known garment: keep the clean name and its count.
    return canonical.has(normalize(only.name)) ? [only] : null;
  }

  // Only split a list we can trust: every piece names an item, and either the
  // pieces carry their own count or all of them are known catalog names.
  const anyQuantity = parsed.some((piece) => piece !== null);
  const cleaned = segments.map((segment, index) =>
    parsed[index]
      ? (parsed[index] as ParsedItemLine)
      : { name: segment.replace(/[.!]+$/, "").trim(), quantity: 1 }
  );
  const everyKnown = cleaned.every((piece) =>
    canonical.has(normalize(piece.name))
  );
  if (!anyQuantity && !everyKnown) return null;
  if (cleaned.length < 2) return null;
  return cleaned;
}
