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

export type ItemCategory = "dry_cleaning" | "product" | "extra";

export interface CatalogItem {
  name: string;
  category: ItemCategory;
  aliases?: string[];
}

export const ITEM_CATEGORIES: {
  key: ItemCategory;
  label: string;
  hint: string;
}[] = [
  {
    key: "dry_cleaning",
    label: "Dry cleaning",
    hint: "Clothes and laundry — counted in the clothes table on the daily report.",
  },
  {
    key: "product",
    label: "Product",
    hint: "The shop's own detergents — printed under Products on the report.",
  },
  {
    key: "extra",
    label: "Extra",
    hint: "Hangers, covers, bags, containers — printed under Products too.",
  },
];

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  dry_cleaning: "Dry cleaning",
  product: "Product",
  extra: "Extra",
};

const BUILT_IN_ITEMS: CatalogItem[] = (catalog as { items: CatalogItem[] })
  .items;

function normalizeCategory(value: unknown): ItemCategory {
  return value === "product" || value === "extra" ? value : "dry_cleaning";
}

// The list in use right now: the database rows once loaded, otherwise the
// built-in JSON list.
let liveItems: CatalogItem[] = BUILT_IN_ITEMS;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let canonical = new Map<string, string>();
let categories = new Map<string, ItemCategory>();

// Products first, then extras: that is the order the /products dropdown shows.
export const PRODUCT_ITEM_NAMES: string[] = [];
export const ALL_ITEM_NAMES: string[] = [];

function rebuild() {
  canonical = new Map();
  categories = new Map();
  PRODUCT_ITEM_NAMES.length = 0;
  ALL_ITEM_NAMES.length = 0;

  for (const item of liveItems) {
    const name = (item.name || "").trim();
    if (!name) continue;
    const category = normalizeCategory(item.category);
    canonical.set(normalize(name), name);
    categories.set(normalize(name), category);
    for (const alias of item.aliases || []) {
      const key = normalize(alias);
      if (!key) continue;
      if (!canonical.has(key)) canonical.set(key, name);
      if (!categories.has(key)) categories.set(key, category);
    }
    ALL_ITEM_NAMES.push(name);
  }

  for (const item of liveItems) {
    if (normalizeCategory(item.category) === "product" && item.name.trim()) {
      PRODUCT_ITEM_NAMES.push(item.name.trim());
    }
  }
  for (const item of liveItems) {
    if (normalizeCategory(item.category) === "extra" && item.name.trim()) {
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

export function getCatalogItems(): CatalogItem[] {
  return liveItems;
}

export function getBuiltInCatalogItems(): CatalogItem[] {
  return BUILT_IN_ITEMS;
}

export function isUsingBuiltInCatalog(): boolean {
  return liveItems === BUILT_IN_ITEMS;
}

// "trouser" → "Pants", "bed cover" → "Bed cover". Anything not in the list is
// kept exactly as typed, so a one-off item is never lost.
export function canonicalItemName(label: string): string {
  const key = normalize(label);
  return canonical.get(key) || label.trim();
}

// The catalog's own name for a label, or null when it is not in the list. The
// daily report uses this to give every known item its own printed row instead
// of sweeping it into "Other Clothes".
export function lookupItemName(label: string): string | null {
  return canonical.get(normalize(label)) || null;
}

// What the shop says this thing is. null means the list has never heard of it,
// so the report falls back to its keyword guesses.
export function lookupItemCategory(label: string): ItemCategory | null {
  return categories.get(normalize(label)) || null;
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
