// The shop's item list, in one editable JSON file (lib/item-catalog.json).
//
// Staff pick from these names while typing an invoice item or a product/extra
// sale, so names stay consistent and the daily report can count "Pants 12 ·
// Jeans 4 · Bed cover 3" instead of a dozen spellings of the same garment.

import catalog from "./item-catalog.json";

export type ItemCategory = "dry_cleaning" | "product" | "extra";

export interface CatalogItem {
  name: string;
  category: ItemCategory;
  aliases?: string[];
}

const ITEMS = (catalog as { items: CatalogItem[] }).items;

export const ITEM_CATALOG: CatalogItem[] = ITEMS;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CANONICAL = new Map<string, string>();
for (const item of ITEMS) {
  CANONICAL.set(normalize(item.name), item.name);
  for (const alias of item.aliases || []) {
    if (!CANONICAL.has(normalize(alias))) CANONICAL.set(normalize(alias), item.name);
  }
}

// "trouser" → "Pants", "bed cover" → "Bed cover". Anything not in the list is
// kept exactly as typed, so a one-off item is never lost.
export function canonicalItemName(label: string): string {
  const key = normalize(label);
  return CANONICAL.get(key) || label.trim();
}

// Suggestions for the typing dropdown: names starting with the query first,
// then names (or aliases) that merely contain it.
export function searchItemCatalog(query: string, limit = 8): string[] {
  const q = normalize(query);
  if (!q) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const item of ITEMS) {
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

// Products and extras (detergent, hanger, bouquet...) — used by the
// product/extra sale form.
export const PRODUCT_ITEM_NAMES = ITEMS.filter(
  (item) => item.category !== "dry_cleaning"
).map((item) => item.name);

export const ALL_ITEM_NAMES = ITEMS.map((item) => item.name);
