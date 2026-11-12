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
    return CANONICAL.has(normalize(only.name)) ? [only] : null;
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
    CANONICAL.has(normalize(piece.name))
  );
  if (!anyQuantity && !everyKnown) return null;
  if (cleaned.length < 2) return null;
  return cleaned;
}

// Products and extras (detergent, hanger, bouquet...) — used by the
// product/extra sale form.
export const PRODUCT_ITEM_NAMES = ITEMS.filter(
  (item) => item.category !== "dry_cleaning"
).map((item) => item.name);

export const ALL_ITEM_NAMES = ITEMS.map((item) => item.name);
