"use client";

// Daily Business Report — printed once a day, money only.
//
// Deliberately minimal and anonymous: it counts what was sold on the chosen
// day (invoices created that day, plus products sold), never client names,
// phone numbers or invoice numbers. Payments collected today on invoices made
// on an earlier day (old debt) are NOT included — this report is the day's
// business, not the day's cash.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, RefreshCw } from "lucide-react";
import { formatCurrency, getLocalDateString } from "@/lib/utils";
import { lookupItemName } from "@/lib/item-catalog";
import { toast } from "@/hooks/use-toast";
import { fetchDailyCashReport, parseLocalYmd } from "@/lib/daily-cash-report";
import {
  buildReport,
  classifyInvoice,
  type DailyCashReportData,
} from "@/lib/daily-cash-report-model";

type ClothesKey =
  | "suits"
  | "shirts"
  | "pants"
  | "overalls"
  | "base"
  | "coats"
  | "dresses"
  | "other";
type ProductKey = "hangers" | "covers" | "containers" | "other_products";

interface Bucket {
  qty: number;
  cash: number;
  momo: number;
  debt: number;
  total: number;
}

// One printed table line, whichever way the day is grouped.
interface GroupedLine extends Bucket {
  key: string;
  label: string;
}

function hasValue(bucket?: Bucket): boolean {
  return Boolean(
    bucket &&
      (bucket.qty || bucket.total || bucket.cash || bucket.momo || bucket.debt)
  );
}

function sumLines(lines: GroupedLine[]): Bucket {
  return lines.reduce(
    (sum, line) => ({
      qty: sum.qty + line.qty,
      cash: sum.cash + line.cash,
      momo: sum.momo + line.momo,
      debt: sum.debt + line.debt,
      total: sum.total + line.total,
    }),
    emptyBucket()
  );
}

function sumBuckets(buckets: Record<string, Bucket>): Bucket {
  return Object.values(buckets).reduce(
    (sum, bucket) => ({
      qty: sum.qty + bucket.qty,
      cash: sum.cash + bucket.cash,
      momo: sum.momo + bucket.momo,
      debt: sum.debt + bucket.debt,
      total: sum.total + bucket.total,
    }),
    emptyBucket()
  );
}

// Only groups that actually received something are printed: a garment group
// with no pieces (and no money) is left out entirely. Fixed rows keep their
// order, catalog items that are not fixed rows follow (most pieces first),
// and "Other Clothes" — only names the catalog does not know — is last.
function visibleGroupRows(
  buckets: Record<string, Bucket>,
  labels: Record<string, string>
): { key: string; label: string }[] {
  const fixedKeys = new Set(CLOTHES_ROWS.map((row) => row.key));
  const fixed = CLOTHES_ROWS.filter(
    (row) => row.key !== "other" && hasValue(buckets[row.key])
  );
  const extra = Object.keys(buckets)
    .filter((key) => !fixedKeys.has(key) && hasValue(buckets[key]))
    .map((key) => ({ key, label: labels[key] || "Other Clothes" }))
    .sort(
      (a, b) =>
        buckets[b.key].qty - buckets[a.key].qty || a.label.localeCompare(b.label)
    );
  const other = hasValue(buckets.other)
    ? [{ key: "other", label: "Other Clothes" }]
    : [];
  return [...fixed, ...extra, ...other];
}

// The fixed rows, in print order. Anything else the catalog knows becomes its
// own row after these ("Socks", "Pillowcase", "Napkin"…), and only a name the
// catalog has never heard of is left in "Other Clothes".
const CLOTHES_ROWS: { key: string; label: string }[] = [
  { key: "suits", label: "Suits" },
  { key: "shirts", label: "Shirts" },
  { key: "pants", label: "Pants" },
  { key: "overalls", label: "Overalls" },
  { key: "base", label: "Base" },
  { key: "coats", label: "Single Coats" },
  { key: "dresses", label: "Dresses" },
  { key: "other", label: "Other Clothes" },
];

const PRODUCT_ROWS: { key: ProductKey; label: string }[] = [
  { key: "hangers", label: "Hangers" },
  { key: "covers", label: "Covers" },
  { key: "containers", label: "Containers" },
  { key: "other_products", label: "Other Products" },
];

const emptyBucket = (): Bucket => ({
  qty: 0,
  cash: 0,
  momo: 0,
  debt: 0,
  total: 0,
});

// How the staff actually write items: "shirts washing", "trouser", "single
// coat", "tshirt", "bedcover". The garment WORD decides the group, so free
// text counts correctly instead of falling into a leftover basket.
const CLOTHES_WORDS: { key: ClothesKey; label: string; test: RegExp }[] = [
  { key: "suits", label: "Suits", test: /\b(suits?|blazers?|tuxedos?|costumes?)\b/ },
  {
    key: "shirts",
    label: "Shirts",
    test: /\b(shirts?|tshirts?|t-?shirts?|tees?|polos?|blouses?)\b/,
  },
  {
    // Overalls are their own item, never counted as trousers.
    key: "overalls",
    label: "Overalls",
    test: /\b(overalls?|over\s?all|dungarees?|igisurubeti|isurubeti)\b/,
  },
  {
    key: "pants",
    label: "Pants",
    test: /\b(pants?|trousers?|jeans?|slacks?|shorts?|skirts?|leggings?)\b/,
  },
  {
    // "Base" is its own garment (also typed "basin" / "bases"), never Other.
    key: "base",
    label: "Base",
    test: /\b(bases?|basin|basins)\b/,
  },
  {
    key: "coats",
    label: "Single Coats",
    test:
      /\b(coats?|jackets?|parkas?|cardigans?|jumpers?|sweaters?|hoodies?|vests?)\b/,
  },
  {
    key: "dresses",
    label: "Dresses",
    test: /\b(dress(?:es)?|gowns?|robes?|kaftans?|kitenge|amida)\b/,
  },
];

interface ClothesGroup {
  // "suits", "pants"… for a fixed row, "item:<name>" for a catalog item with
  // no fixed row, "other" only for a name the catalog does not know.
  key: string;
  label: string;
  known: boolean;
}

function clothesGroup(name: string): ClothesGroup {
  const n = name.toLowerCase();
  for (const entry of CLOTHES_WORDS) {
    if (entry.test.test(n)) {
      return { key: entry.key, label: entry.label, known: true };
    }
  }
  const item = lookupItemName(name);
  if (item) return { key: `item:${item.toLowerCase()}`, label: item, known: true };
  return { key: "other", label: "Other Clothes", known: false };
}

// "trouser and shirt" is two garments, not one unreadable line.
function splitGarments(name: string): string[] {
  const parts = name
    .split(/\s*(?:,|;|\/|&|\+|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return [name];
  const recognized = parts.filter((part) => clothesGroup(part).known).length;
  return recognized >= 2 ? parts : [name];
}

// Money is shared in whole francs; the last piece takes the remainder so the
// group total stays exact.
function shareOf(value: number, index: number, count: number): number {
  const each = Math.round(value / count);
  return index === count - 1 ? value - each * (count - 1) : each;
}

// Pieces are always whole garments: "trouser and shirt" on one line is one
// trouser + one shirt, never half of each.
function splitQuantity(total: number, index: number, count: number): number {
  const whole = Math.max(0, Math.round(total));
  if (whole === 0) return 0;
  const base = Math.floor(whole / count);
  const extra = whole - base * count;
  const share = base + (index < extra ? 1 : 0);
  return Math.max(share, 1);
}

function productGroup(name: string): ProductKey {
  const n = name.toLowerCase();
  if (/hanger/.test(n)) return "hangers";
  if (/cover/.test(n)) return "covers";
  // A container is sold goods, never a garment: it gets its own line so it
  // never lands in the clothes table or in "Other Clothes".
  if (/container|jerry ?can|bucket/.test(n)) return "containers";
  return "other_products";
}

function formatReportDate(ymd: string): string {
  return parseLocalYmd(ymd).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function money(value: number): string {
  return value ? formatCurrency(value) : "—";
}

export function DailyCashReport() {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [data, setData] = useState<DailyCashReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (ymd: string) => {
    setLoading(true);
    try {
      const result = await fetchDailyCashReport(ymd);
      setData(result);
      setLoadedDate(ymd);
    } catch (error: any) {
      setData(null);
      setLoadedDate(null);
      toast({
        title: "Failed to load the daily report",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(getLocalDateString());
  }, [load]);

  // The whole day, old-debt collections included: page 1 prints what came in
  // today, page 2 prints what was collected today for invoices made earlier.
  const model = useMemo(
    () => (data && loadedDate ? buildReport(data, loadedDate) : null),
    [data, loadedDate]
  );

  const reportDate = loadedDate || selectedDate;

  const buckets = useMemo(() => {
    // Keyed by group: the fixed rows, plus "item:<name>" for catalog items
    // that have no fixed row of their own. Two sides: what came in today, and
    // what was collected today for invoices made on an earlier day.
    const emptyClothes = () => {
      const clothes: Record<string, Bucket> = {};
      const labels: Record<string, string> = {};
      for (const row of CLOTHES_ROWS) {
        clothes[row.key] = emptyBucket();
        labels[row.key] = row.label;
      }
      return { clothes, labels };
    };
    const emptyProducts = (): Record<string, Bucket> => ({
      hangers: emptyBucket(),
      covers: emptyBucket(),
      containers: emptyBucket(),
      other_products: emptyBucket(),
    });

    const today = { ...emptyClothes(), products: emptyProducts() };
    const past = { ...emptyClothes(), products: emptyProducts() };

    if (!model) {
      return {
        clothes: today.clothes,
        clothesLabels: today.labels,
        products: today.products,
        pastClothes: past.clothes,
        pastClothesLabels: past.labels,
        pastProducts: past.products,
      };
    }

    const add = (side: typeof today, row: (typeof model.rows)[number]) => {
      if (row.category !== "dry_cleaning") {
        const bucket = side.products[productGroup(row.items)];
        bucket.qty += row.qty;
        bucket.cash += row.cash;
        bucket.momo += row.momo;
        bucket.debt += row.debt;
        bucket.total += row.total;
        return;
      }

      // A line naming several garments ("trouser and shirt") is counted in
      // each garment group, sharing the line's quantity and money evenly.
      const pieces = splitGarments(row.items);
      pieces.forEach((piece, index) => {
        const group = clothesGroup(piece);
        side.labels[group.key] = group.label;
        const bucket = (side.clothes[group.key] =
          side.clothes[group.key] || emptyBucket());
        bucket.qty += splitQuantity(row.qty, index, pieces.length);
        bucket.cash += shareOf(row.cash, index, pieces.length);
        bucket.momo += shareOf(row.momo, index, pieces.length);
        bucket.debt += shareOf(row.debt, index, pieces.length);
        bucket.total += shareOf(row.total, index, pieces.length);
      });
    };

    for (const row of model.rows) add(row.oldDebt ? past : today, row);

    return {
      clothes: today.clothes,
      clothesLabels: today.labels,
      products: today.products,
      pastClothes: past.clothes,
      pastClothesLabels: past.labels,
      pastProducts: past.products,
    };
  }, [model]);

  const clothesTotal = useMemo(() => sumBuckets(buckets.clothes), [buckets]);
  const productsTotal = useMemo(() => sumBuckets(buckets.products), [buckets]);
  const pastClothesTotal = useMemo(
    () => sumBuckets(buckets.pastClothes),
    [buckets]
  );
  const pastProductsTotal = useMemo(
    () => sumBuckets(buckets.pastProducts),
    [buckets]
  );

  const cashReceived = clothesTotal.cash + productsTotal.cash;
  const momoReceived = clothesTotal.momo + productsTotal.momo;
  const totalDebt = clothesTotal.debt + productsTotal.debt;
  const grandTotal = cashReceived + momoReceived;

  // Collected today on invoices made on an earlier day. Only the money taken
  // today counts here — when a client pays the last part of an old invoice,
  // that part is what shows, not the invoice's original total.
  const pastCash = pastClothesTotal.cash + pastProductsTotal.cash;
  const pastMomo = pastClothesTotal.momo + pastProductsTotal.momo;
  const pastReceived = pastCash + pastMomo;
  const pastPieces = pastClothesTotal.qty + pastProductsTotal.qty;

  const visibleClothes = useMemo(
    () => visibleGroupRows(buckets.clothes, buckets.clothesLabels),
    [buckets]
  );
  const visibleProducts = useMemo(
    () =>
      PRODUCT_ROWS.filter((row) => hasValue(buckets.products[row.key])),
    [buckets]
  );
  const pastVisibleClothes = useMemo(
    () => visibleGroupRows(buckets.pastClothes, buckets.pastClothesLabels),
    [buckets]
  );
  const pastVisibleProducts = useMemo(
    () =>
      PRODUCT_ROWS.filter((row) => hasValue(buckets.pastProducts[row.key])),
    [buckets]
  );

  // The day can be read two ways: by garment group (the totals the boss
  // signs) or invoice by invoice (what actually came in, in the order it
  // came). Both print the same money. Neither shows client details or an
  // invoice number.
  const [groupBy, setGroupBy] = useState<"item" | "invoice">("item");

  // Invoice-by-invoice rows for the clothes table: only invoices that are
  // clothes (a detergent-only invoice belongs under products), one row each.
  const invoiceClothesRows = useMemo(() => {
    if (!model || !data) return [];
    const productInvoices = new Set(
      data.invoices
        .filter((invoice) => classifyInvoice(invoice) === "product")
        .map((invoice) => invoice.id)
    );
    return model.invoiceRows.filter((row) => {
      const id = row.key.replace(/^inv-/, "");
      if (row.key === id || productInvoices.has(id)) return false;
      return Boolean(
        row.qty || row.total || row.cash || row.momo || row.debt
      );
    });
  }, [model, data]);

  const productInvoiceRows = useMemo(() => {
    if (!model || !data) return [];
    const productInvoices = new Set(
      data.invoices
        .filter((invoice) => classifyInvoice(invoice) === "product")
        .map((invoice) => invoice.id)
    );
    return model.invoiceRows.filter((row) =>
      productInvoices.has(row.key.replace(/^inv-/, ""))
    );
  }, [model, data]);

  const clothesLines = useMemo<GroupedLine[]>(() => {
    if (groupBy === "item") {
      return visibleClothes.map((row) => ({
        key: row.key,
        label: row.label,
        ...buckets.clothes[row.key],
      }));
    }
    return invoiceClothesRows.map((row) => ({
      key: row.key,
      label: row.items,
      qty: row.qty,
      cash: row.cash,
      momo: row.momo,
      debt: row.debt,
      total: row.total,
    }));
  }, [groupBy, visibleClothes, buckets, invoiceClothesRows]);

  const productLines = useMemo<GroupedLine[]>(() => {
    if (groupBy === "item") {
      return visibleProducts.map((row) => ({
        key: row.key,
        label: row.label,
        ...buckets.products[row.key],
      }));
    }
    // Products sold on their own (recorded on the /products route) keep their own
    // line so each one can still be deleted, and a detergent invoice stays one
    // line as well.
    const manual = model ? model.rows.filter((row) => row.sourceId) : [];
    return [
      ...manual.map((row) => ({
        key: row.key,
        label:
          row.qty > 1 ? `${row.items} x${row.qty}` : row.items,
        qty: row.qty,
        cash: row.cash,
        momo: row.momo,
        debt: row.debt,
        total: row.total,
      })),
      ...productInvoiceRows.map((row) => ({
        key: row.key,
        label: row.items,
        qty: row.qty,
        cash: row.cash,
        momo: row.momo,
        debt: row.debt,
        total: row.total,
      })),
    ];
  }, [groupBy, visibleProducts, buckets, model, productInvoiceRows]);

  // Page 2: invoices made on an earlier day that were paid today.
  const pastInvoiceRows = useMemo(
    () => (model ? model.invoiceRows.filter((row) => row.oldDebt) : []),
    [model]
  );

  const pastClothesLines = useMemo<GroupedLine[]>(() => {
    if (groupBy === "invoice") {
      return pastInvoiceRows.map((row) => ({
        key: row.key,
        label: row.items,
        qty: row.qty,
        cash: row.cash,
        momo: row.momo,
        debt: row.debt,
        total: row.total,
      }));
    }
    return pastVisibleClothes.map((row) => ({
      key: row.key,
      label: row.label,
      ...buckets.pastClothes[row.key],
    }));
  }, [groupBy, pastVisibleClothes, buckets, pastInvoiceRows]);

  const pastProductLines = useMemo<GroupedLine[]>(() => {
    if (groupBy === "invoice") return [];
    return pastVisibleProducts.map((row) => ({
      key: row.key,
      label: row.label,
      ...buckets.pastProducts[row.key],
    }));
  }, [groupBy, pastVisibleProducts, buckets]);

  // Footer sums follow whatever is printed, so the table always adds up.
  const clothesLinesTotal = useMemo(
    () => sumLines(clothesLines),
    [clothesLines]
  );
  const productLinesTotal = useMemo(
    () => sumLines(productLines),
    [productLines]
  );
  const pastClothesLinesTotal = useMemo(
    () => sumLines(pastClothesLines),
    [pastClothesLines]
  );
  const pastProductLinesTotal = useMemo(
    () => sumLines(pastProductLines),
    [pastProductLines]
  );

  const cell = "border border-black px-2 py-1";

  return (
    <div className="min-h-screen bg-background">
      <div className="no-print container mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Daily Business Report</h1>
          <p className="text-sm text-muted-foreground">
            Money and items for one day. No client details.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />
          <Button
            onClick={() => load(selectedDate)}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Loading..." : "Generate"}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
            disabled={!model}
            className="flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <div className="flex items-center gap-1 rounded-md border p-1">
            <Button
              size="sm"
              variant={groupBy === "item" ? "default" : "ghost"}
              onClick={() => setGroupBy("item")}
            >
              By item
            </Button>
            <Button
              size="sm"
              variant={groupBy === "invoice" ? "default" : "ghost"}
              onClick={() => setGroupBy("invoice")}
            >
              By invoice
            </Button>
          </div>
        </div>
      </div>

      <div className="print-content print-flow mx-auto max-w-3xl px-4 pb-10">
        <h2 className="mt-2 text-center text-lg font-bold uppercase tracking-wide">
          Daily Business Report
        </h2>
        <p className="mb-4 text-center text-sm">
          Date: {formatReportDate(reportDate)}
          <span className="ml-1 text-xs uppercase tracking-wide text-muted-foreground">
            · grouped by {groupBy === "item" ? "item" : "invoice"}
          </span>
        </p>

        {!model ? (
          <p className="py-10 text-center text-muted-foreground">
            {loading
              ? "Loading report..."
              : "Pick a date and generate the report."}
          </p>
        ) : (
          <>
            <h3 className="mb-1 font-bold">1. ITEMS RECEIVED (CLOTHES IN)</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted print:bg-transparent">
                  <th className={`${cell} text-left`}>Items</th>
                  <th className={`${cell} text-right`}>Quantity</th>
                  <th className={`${cell} text-right`}>Cash</th>
                  <th className={`${cell} text-right`}>MoMo</th>
                  <th className={`${cell} text-right`}>Debt</th>
                  <th className={`${cell} text-right`}>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {clothesLines.length === 0 && (
                  <tr>
                    <td
                      className={`${cell} text-muted-foreground`}
                      colSpan={6}
                    >
                      No clothes received today.
                    </td>
                  </tr>
                )}
                {clothesLines.map((line) => (
                  <tr key={line.key}>
                    <td
                      className={`${cell} ${
                        groupBy === "invoice" ? "text-xs leading-snug" : ""
                      }`}
                    >
                      {line.label}
                    </td>
                    <td className={`${cell} text-right`}>{line.qty || ""}</td>
                    <td className={`${cell} text-right`}>
                      {money(line.cash)}
                    </td>
                    <td className={`${cell} text-right`}>
                      {money(line.momo)}
                    </td>
                    <td
                      className={`${cell} text-right font-bold text-red-600`}
                    >
                      {money(line.debt)}
                    </td>
                    <td className={`${cell} text-right`}>
                      {money(line.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className={cell}>TOTAL</td>
                  <td className={`${cell} text-right`}>{clothesLinesTotal.qty}</td>
                  <td className={`${cell} text-right`}>
                    {formatCurrency(clothesLinesTotal.cash)}
                  </td>
                  <td className={`${cell} text-right`}>
                    {formatCurrency(clothesLinesTotal.momo)}
                  </td>
                  <td
                    className={`${cell} text-right font-bold text-red-600`}
                  >
                    {formatCurrency(clothesLinesTotal.debt)}
                  </td>
                  <td className={`${cell} text-right`}>
                    {formatCurrency(clothesLinesTotal.total)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <h3 className="mb-1 mt-5 font-bold">
              2. PRODUCTS SOLD / ITEMS OUT
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted print:bg-transparent">
                  <th className={`${cell} text-left`}>Products</th>
                  <th className={`${cell} text-right`}>Quantity</th>
                  <th className={`${cell} text-right`}>Cash</th>
                  <th className={`${cell} text-right`}>MoMo</th>
                  <th className={`${cell} text-right`}>Debt</th>
                  <th className={`${cell} text-right`}>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {productLines.length === 0 && (
                  <tr>
                    <td
                      className={`${cell} text-muted-foreground`}
                      colSpan={6}
                    >
                      No products sold today.
                    </td>
                  </tr>
                )}
                {productLines.map((line) => (
                  <tr key={line.key}>
                    <td
                      className={`${cell} ${
                        groupBy === "invoice" ? "text-xs leading-snug" : ""
                      }`}
                    >
                      {line.label}
                    </td>
                    <td className={`${cell} text-right`}>{line.qty || ""}</td>
                    <td className={`${cell} text-right`}>
                      {money(line.cash)}
                    </td>
                    <td className={`${cell} text-right`}>
                      {money(line.momo)}
                    </td>
                    <td
                      className={`${cell} text-right font-bold text-red-600`}
                    >
                      {money(line.debt)}
                    </td>
                    <td className={`${cell} text-right`}>
                      {money(line.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className={cell}>TOTAL</td>
                  <td className={`${cell} text-right`}>{productLinesTotal.qty}</td>
                  <td className={`${cell} text-right`}>
                    {formatCurrency(productLinesTotal.cash)}
                  </td>
                  <td className={`${cell} text-right`}>
                    {formatCurrency(productLinesTotal.momo)}
                  </td>
                  <td
                    className={`${cell} text-right font-bold text-red-600`}
                  >
                    {formatCurrency(productLinesTotal.debt)}
                  </td>
                  <td className={`${cell} text-right`}>
                    {formatCurrency(productLinesTotal.total)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <h3 className="mb-1 mt-5 font-bold">3. DAILY SUMMARY</h3>
            <div className="space-y-1 text-sm">
              <p>- Total Clothes Received: {clothesTotal.qty}</p>
              <p>- Total Products Sold: {productsTotal.qty}</p>
              <p>- Total Cash Received: {formatCurrency(cashReceived)}</p>
              <p>- Total MoMo Received: {formatCurrency(momoReceived)}</p>
              <p className="font-bold text-red-600">
                - Total Debt: {formatCurrency(totalDebt)}
              </p>
              {/* Written in by hand when the report is signed off. */}
              <p>
                - Money on Dry Cleaner phone:{" "}
                <span className="ml-1 inline-block w-48 border-b border-black align-bottom">
                  &nbsp;
                </span>
              </p>
              <p>
                - Money on Products phone:{" "}
                <span className="ml-1 inline-block w-48 border-b border-black align-bottom">
                  &nbsp;
                </span>
              </p>
              <p className="mt-2 border-t border-black pt-2 text-base font-bold">
                GRAND TOTAL RECEIVED: {formatCurrency(grandTotal)}
              </p>
            </div>

            <div className="mt-8 space-y-5 text-sm">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p>Prepared by (name)</p>
                  <p className="mt-4 border-t border-black pt-1">
                    &nbsp;
                  </p>
                </div>
                <div className="min-w-[220px]">
                  <p>Signature</p>
                  <p className="mt-4 border-t border-black pt-1">&nbsp;</p>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p>Approved by</p>
                  <p className="mt-1 font-semibold">Isaac NSENGIYUMVA</p>
                </div>
                <div className="min-w-[220px]">
                  <p>Signature</p>
                  <p className="mt-4 border-t border-black pt-1">&nbsp;</p>
                </div>
              </div>
            </div>

            {/* PAGE 2 — invoices made on an earlier day that were paid today.
                Only the money taken today appears here; a client finishing the
                last part of an old invoice shows that part, not the old total. */}
            <div className="print-page-break mt-10 border-t-2 border-black pt-6 print:border-0 print:pt-0">
              <h2 className="mt-2 text-center text-lg font-bold uppercase tracking-wide">
                Past Invoices Paid Today
              </h2>
              <p className="mb-4 text-center text-sm">
                Date: {formatReportDate(reportDate)}
                <span className="ml-1 text-xs uppercase tracking-wide text-muted-foreground">
                  · not sold today
                </span>
              </p>

              <h3 className="mb-1 font-bold">
                1. CLOTHES PAID FOR TODAY (FROM EARLIER INVOICES)
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted print:bg-transparent">
                    <th className={`${cell} text-left`}>Items</th>
                    <th className={`${cell} text-right`}>Quantity</th>
                    <th className={`${cell} text-right`}>Cash</th>
                    <th className={`${cell} text-right`}>MoMo</th>
                    <th className={`${cell} text-right`}>Total Received</th>
                  </tr>
                </thead>
                <tbody>
                  {pastClothesLines.length === 0 && (
                    <tr>
                      <td
                        className={`${cell} text-muted-foreground`}
                        colSpan={5}
                      >
                        Nothing from earlier invoices was paid today.
                      </td>
                    </tr>
                  )}
                  {pastClothesLines.map((line) => (
                    <tr key={line.key}>
                      <td
                        className={`${cell} ${
                          groupBy === "invoice" ? "text-xs leading-snug" : ""
                        }`}
                      >
                        {line.label}
                      </td>
                      <td className={`${cell} text-right`}>
                        {line.qty || ""}
                      </td>
                      <td className={`${cell} text-right`}>
                        {money(line.cash)}
                      </td>
                      <td className={`${cell} text-right`}>
                        {money(line.momo)}
                      </td>
                      <td className={`${cell} text-right`}>
                        {money(line.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td className={cell}>TOTAL</td>
                    <td className={`${cell} text-right`}>
                      {pastClothesLinesTotal.qty}
                    </td>
                    <td className={`${cell} text-right`}>
                      {formatCurrency(pastClothesLinesTotal.cash)}
                    </td>
                    <td className={`${cell} text-right`}>
                      {formatCurrency(pastClothesLinesTotal.momo)}
                    </td>
                    <td className={`${cell} text-right`}>
                      {formatCurrency(pastClothesLinesTotal.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {(
                <>
                  <h3 className="mb-1 mt-5 font-bold">
                    2. PRODUCTS PAID FOR TODAY (FROM EARLIER INVOICES)
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted print:bg-transparent">
                        <th className={`${cell} text-left`}>Products</th>
                        <th className={`${cell} text-right`}>Quantity</th>
                        <th className={`${cell} text-right`}>Cash</th>
                        <th className={`${cell} text-right`}>MoMo</th>
                        <th className={`${cell} text-right`}>Total Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastProductLines.length === 0 && (
                        <tr>
                          <td
                            className={`${cell} text-muted-foreground`}
                            colSpan={5}
                          >
                            No products from earlier invoices were paid today.
                          </td>
                        </tr>
                      )}
                      {pastProductLines.map((line) => (
                        <tr key={line.key}>
                          <td className={cell}>{line.label}</td>
                          <td className={`${cell} text-right`}>
                            {line.qty || ""}
                          </td>
                          <td className={`${cell} text-right`}>
                            {money(line.cash)}
                          </td>
                          <td className={`${cell} text-right`}>
                            {money(line.momo)}
                          </td>
                          <td className={`${cell} text-right`}>
                            {money(line.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold">
                        <td className={cell}>TOTAL</td>
                        <td className={`${cell} text-right`}>
                          {pastProductLinesTotal.qty}
                        </td>
                        <td className={`${cell} text-right`}>
                          {formatCurrency(pastProductLinesTotal.cash)}
                        </td>
                        <td className={`${cell} text-right`}>
                          {formatCurrency(pastProductLinesTotal.momo)}
                        </td>
                        <td className={`${cell} text-right`}>
                          {formatCurrency(pastProductLinesTotal.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}

              <h3 className="mb-1 mt-5 font-bold">
                3. SUMMARY OF EARLIER INVOICES
              </h3>
              <div className="space-y-1 text-sm">
                <p>- Total pieces collected today: {pastPieces}</p>
                <p>- Total Cash Received: {formatCurrency(pastCash)}</p>
                <p>- Total MoMo Received: {formatCurrency(pastMomo)}</p>
                <p className="mt-2 border-t border-black pt-2 text-base font-bold">
                  TOTAL RECEIVED ON EARLIER INVOICES:{" "}
                  {formatCurrency(pastReceived)}
                </p>
              </div>

              <p className="mt-8 text-center text-sm font-semibold uppercase tracking-wide">
                End of daily report
              </p>
            </div>

          </>
        )}
      </div>


    </div>
  );
}
