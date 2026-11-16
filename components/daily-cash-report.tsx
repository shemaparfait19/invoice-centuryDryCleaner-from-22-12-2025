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
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Printer, RefreshCw, Plus, Trash2 } from "lucide-react";
import { formatCurrency, getLocalDateString } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  addExtraSale,
  deleteExtraSale,
  fetchDailyCashReport,
  getDayRangeIso,
  parseLocalYmd,
  saveOpeningBalances,
} from "@/lib/daily-cash-report";
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
type ProductKey = "hangers" | "covers" | "other_products";

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

const CLOTHES_ROWS: { key: ClothesKey; label: string }[] = [
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
const CLOTHES_WORDS: { key: ClothesKey; test: RegExp }[] = [
  { key: "suits", test: /\b(suits?|blazers?|tuxedos?|costumes?)\b/ },
  {
    key: "shirts",
    test: /\b(shirts?|tshirts?|t-?shirts?|tees?|polos?|blouses?)\b/,
  },
  {
    // Overalls are their own item, never counted as trousers.
    key: "overalls",
    test: /\b(overalls?|over\s?all|dungarees?|igisurubeti|isurubeti)\b/,
  },
  {
    key: "pants",
    test: /\b(pants?|trousers?|jeans?|slacks?|shorts?|skirts?|leggings?)\b/,
  },
  {
    // "Base" is its own garment (also typed "basin" / "bases"), never Other.
    key: "base",
    test: /\b(bases?|basin|basins)\b/,
  },
  {
    key: "coats",
    test:
      /\b(coats?|jackets?|parkas?|cardigans?|jumpers?|sweaters?|hoodies?|vests?)\b/,
  },
  {
    key: "dresses",
    test: /\b(dress(?:es)?|gowns?|robes?|kaftans?|kitenge|amida)\b/,
  },
  {
    key: "other",
    test:
      /\b(underpants?|underwear|boxers?|socks?|stockings?|ties?|scarves?|scarfs?|shawls?|hats?|caps?|beanies?|gloves?|belts?|shoes?|boots?|sandals?|slippers?|sneakers?|bags?|handbags?|luggage|suitcases?|umbrellas?|pillows?|pillowcases?|towels?|napkins?|bedcovers?|bedsheets?|blankets?|comforters?|quilts?|curtains?|mattress|mosquito|uniforms?|tracksuits?|jerseys?|pyjamas?|pajamas?|lingerie|bras?)\b/,
  },
];

function clothesGroup(name: string): ClothesKey {
  const n = name.toLowerCase();
  for (const entry of CLOTHES_WORDS) {
    if (entry.test.test(n)) return entry.key;
  }
  return "other";
}

// "trouser and shirt" is two garments, not one unreadable line.
function splitGarments(name: string): string[] {
  const parts = name
    .split(/\s*(?:,|;|\/|&|\+|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return [name];
  const recognized = parts.filter(
    (part) => clothesGroup(part) !== "other"
  ).length;
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

// One line in the "product sold" dialog. Several lines can be saved at once.
interface SaleDraft {
  description: string;
  quantity: string;
  total: string;
  cash: string;
  momo: string;
}

const emptySaleDraft = (): SaleDraft => ({
  description: "",
  quantity: "1",
  total: "",
  cash: "",
  momo: "",
});

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

  // Today's business only: old-debt collections (payments for invoices created
  // on an earlier day) are left out entirely.
  const model = useMemo(
    () =>
      data && loadedDate
        ? buildReport({ ...data, dayPayments: [] }, loadedDate)
        : null,
    [data, loadedDate]
  );

  const reportDate = loadedDate || selectedDate;

  const buckets = useMemo(() => {
    const clothes: Record<ClothesKey, Bucket> = {
      suits: emptyBucket(),
      shirts: emptyBucket(),
      pants: emptyBucket(),
      overalls: emptyBucket(),
      base: emptyBucket(),
      coats: emptyBucket(),
      dresses: emptyBucket(),
      other: emptyBucket(),
    };
    const products: Record<ProductKey, Bucket> = {
      hangers: emptyBucket(),
      covers: emptyBucket(),
      other_products: emptyBucket(),
    };
    if (!model) return { clothes, products };

    for (const row of model.rows) {
      if (row.category !== "dry_cleaning") {
        const bucket = products[productGroup(row.items)];
        bucket.qty += row.qty;
        bucket.cash += row.cash;
        bucket.momo += row.momo;
        bucket.debt += row.debt;
        bucket.total += row.total;
        continue;
      }

      // A line naming several garments ("trouser and shirt") is counted in
      // each garment group, sharing the line's quantity and money evenly.
      const pieces = splitGarments(row.items);
      pieces.forEach((piece, index) => {
        const bucket = clothes[clothesGroup(piece)];
        bucket.qty += splitQuantity(row.qty, index, pieces.length);
        bucket.cash += shareOf(row.cash, index, pieces.length);
        bucket.momo += shareOf(row.momo, index, pieces.length);
        bucket.debt += shareOf(row.debt, index, pieces.length);
        bucket.total += shareOf(row.total, index, pieces.length);
      });
    }
    return { clothes, products };
  }, [model]);

  const clothesTotal = useMemo(
    () =>
      CLOTHES_ROWS.reduce(
        (sum, row) => {
          const bucket = buckets.clothes[row.key];
          return {
            qty: sum.qty + bucket.qty,
            cash: sum.cash + bucket.cash,
            momo: sum.momo + bucket.momo,
            debt: sum.debt + bucket.debt,
            total: sum.total + bucket.total,
          };
        },
        emptyBucket()
      ),
    [buckets]
  );

  const productsTotal = useMemo(
    () =>
      PRODUCT_ROWS.reduce(
        (sum, row) => {
          const bucket = buckets.products[row.key];
          return {
            qty: sum.qty + bucket.qty,
            cash: sum.cash + bucket.cash,
            momo: sum.momo + bucket.momo,
            debt: sum.debt + bucket.debt,
            total: sum.total + bucket.total,
          };
        },
        emptyBucket()
      ),
    [buckets]
  );

  const cashReceived = clothesTotal.cash + productsTotal.cash;
  const momoReceived = clothesTotal.momo + productsTotal.momo;
  const totalDebt = clothesTotal.debt + productsTotal.debt;
  const grandTotal = cashReceived + momoReceived;

  // Money sitting on each phone: what was there at the start, plus what came
  // in today, minus anything taken out.
  const phoneBalance = (key: "cleaner_phone" | "products_phone") =>
    model?.accounts.find((account) => account.account === key)?.balance || 0;

  // Only rows that actually received something are printed: a garment group
  // with no pieces (and no money) is left out entirely.
  const visibleClothes = CLOTHES_ROWS.filter((row) => {
    const bucket = buckets.clothes[row.key];
    return Boolean(
      bucket.qty || bucket.total || bucket.cash || bucket.momo || bucket.debt
    );
  });
  const visibleProducts = PRODUCT_ROWS.filter((row) => {
    const bucket = buckets.products[row.key];
    return Boolean(
      bucket.qty || bucket.total || bucket.cash || bucket.momo || bucket.debt
    );
  });

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
    // Products sold on their own (the "Product sold" dialog) keep their own
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

  // Footer sums follow whatever is printed, so the table always adds up.
  const clothesLinesTotal = useMemo(
    () =>
      clothesLines.reduce(
        (sum, line) => ({
          qty: sum.qty + line.qty,
          cash: sum.cash + line.cash,
          momo: sum.momo + line.momo,
          debt: sum.debt + line.debt,
          total: sum.total + line.total,
        }),
        emptyBucket()
      ),
    [clothesLines]
  );

  const productLinesTotal = useMemo(
    () =>
      productLines.reduce(
        (sum, line) => ({
          qty: sum.qty + line.qty,
          cash: sum.cash + line.cash,
          momo: sum.momo + line.momo,
          debt: sum.debt + line.debt,
          total: sum.total + line.total,
        }),
        emptyBucket()
      ),
    [productLines]
  );

  // --- product / extra sale entry -----------------------------------------
  const [saleOpen, setSaleOpen] = useState(false);
  const [saleRows, setSaleRows] = useState<SaleDraft[]>([emptySaleDraft()]);
  const [savingSale, setSavingSale] = useState(false);

  const updateSaleRow = (index: number, patch: Partial<SaleDraft>) =>
    setSaleRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  const addSaleRow = () => setSaleRows((rows) => [...rows, emptySaleDraft()]);
  const removeSaleRow = (index: number) =>
    setSaleRows((rows) =>
      rows.length === 1
        ? [emptySaleDraft()]
        : rows.filter((_, i) => i !== index)
    );

  // What is already on each phone at the start of the day.
  const [phonesCleaner, setPhonesCleaner] = useState("");
  const [phonesProducts, setPhonesProducts] = useState("");
  const [savingPhones, setSavingPhones] = useState(false);

  useEffect(() => {
    setPhonesCleaner(
      data?.opening ? String(data.opening.openingCleanerPhone) : ""
    );
    setPhonesProducts(
      data?.opening ? String(data.opening.openingProductsPhone) : ""
    );
  }, [data]);

  const submitSales = async () => {
    // Blank lines are ignored, so you can leave the last row empty.
    const drafts = saleRows.filter((row) => row.description.trim());
    if (drafts.length === 0) {
      toast({ title: "Enter what was sold", variant: "destructive" });
      return;
    }

    const parsed = drafts.map((row) => ({
      description: row.description.trim(),
      quantity: Number(row.quantity.replace(/[^0-9.]/g, "")) || 1,
      total: Number(row.total.replace(/[^0-9.]/g, "")) || 0,
      cash: Number(row.cash.replace(/[^0-9.]/g, "")) || 0,
      momo: Number(row.momo.replace(/[^0-9.]/g, "")) || 0,
    }));

    const badTotal = parsed.find((sale) => sale.total <= 0);
    if (badTotal) {
      toast({
        title: `Enter the total price for ${badTotal.description}`,
        variant: "destructive",
      });
      return;
    }
    const overpaid = parsed.find(
      (sale) => sale.cash + sale.momo > sale.total + 0.5
    );
    if (overpaid) {
      toast({
        title: `Paid more than the total for ${overpaid.description}`,
        description: "Check the cash and MoMo amounts.",
        variant: "destructive",
      });
      return;
    }

    setSavingSale(true);
    const { fromIso } = getDayRangeIso(reportDate);
    let saved = 0;
    try {
      for (const sale of parsed) {
        await addExtraSale({
          soldAt: fromIso,
          category: /hanger|cover/i.test(sale.description) ? "extra" : "product",
          description: sale.description,
          quantity: sale.quantity,
          totalPrice: sale.total,
          amountPaidCash: sale.cash,
          amountPaidMomo: sale.momo,
        });
        saved += 1;
      }
      // The dialog stays open with a fresh line, so more can be added at once.
      setSaleRows([emptySaleDraft()]);
      await load(reportDate);
      toast({ title: `${saved} sale${saved === 1 ? "" : "s"} recorded` });
    } catch (error: any) {
      toast({
        title: saved > 0 ? `${saved} saved, the rest failed` : "Could not save the sale",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
      if (saved > 0) await load(reportDate);
    } finally {
      setSavingSale(false);
    }
  };

  const submitPhones = async () => {
    const cleanerPhone = Number(phonesCleaner.replace(/[^0-9.]/g, "")) || 0;
    const productsPhone = Number(phonesProducts.replace(/[^0-9.]/g, "")) || 0;
    setSavingPhones(true);
    try {
      await saveOpeningBalances(
        reportDate,
        {
          cleanerPhone,
          productsPhone,
          cash: data?.opening?.openingCash || 0,
        },
        undefined,
        undefined
      );
      await load(reportDate);
      toast({ title: "Phone money saved" });
    } catch (error: any) {
      toast({
        title: "Could not save the phone money",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingPhones(false);
    }
  };

  const removeSale = async (id: string) => {
    try {
      await deleteExtraSale(id);
      await load(reportDate);
      toast({ title: "Sale deleted" });
    } catch (error: any) {
      toast({
        title: "Could not delete the sale",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

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
          <Button
            variant="secondary"
            onClick={() => setSaleOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Product sold
          </Button>
        </div>
      </div>

      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-end gap-3 rounded-md border px-4 py-3">
        <div>
          <Label htmlFor="phones-cleaner" className="text-xs">
            Money on Dry Cleaner phone
          </Label>
          <CurrencyInput
            id="phones-cleaner"
            className="w-36"
            value={phonesCleaner}
            onChange={setPhonesCleaner}
          />
        </div>
        <div>
          <Label htmlFor="phones-products" className="text-xs">
            Money on Products phone
          </Label>
          <CurrencyInput
            id="phones-products"
            className="w-36"
            value={phonesProducts}
            onChange={setPhonesProducts}
          />
        </div>
        <Button onClick={submitPhones} disabled={savingPhones} size="sm">
          {savingPhones ? "Saving..." : "Save phone money"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Today&apos;s MoMo on each phone is added to this.
        </p>
      </div>

      <div className="print-content mx-auto max-w-3xl px-4 pb-10">
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
              <p>
                - Money on Dry Cleaner phone:{" "}
                {formatCurrency(phoneBalance("cleaner_phone"))}
              </p>
              <p>
                - Money on Products phone:{" "}
                {formatCurrency(phoneBalance("products_phone"))}
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

            <p className="mt-8 text-center text-sm font-semibold uppercase tracking-wide">
              End of daily report
            </p>

            {data && data.extraSales.length > 0 && (
              <div className="no-print mt-6 rounded-md border p-3 text-xs">
                <p className="mb-1 font-semibold">
                  Product sales recorded on {formatReportDate(reportDate)}
                </p>
                <ul className="space-y-1">
                  {data.extraSales.map((sale) => (
                    <li
                      key={sale.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <span>
                        {sale.description} × {sale.quantity} —{" "}
                        {formatCurrency(sale.totalPrice)}
                      </span>
                      <button
                        type="button"
                        title="Delete this sale"
                        onClick={() => removeSale(sale.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Product / extra sold</DialogTitle>
            <DialogDescription>
              Add as many products as you like, then save them all at once.
              Hangers, covers, detergent — sold outside an invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {saleRows.map((row, index) => (
              <div key={index} className="space-y-2 rounded-md border p-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor={`sale-description-${index}`}>
                      Item {index + 1}
                    </Label>
                    <Input
                      id={`sale-description-${index}`}
                      value={row.description}
                      onChange={(e) =>
                        updateSaleRow(index, { description: e.target.value })
                      }
                      placeholder="e.g. Hanger, Cover, Detergent"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Remove this line"
                    onClick={() => removeSaleRow(index)}
                    disabled={saleRows.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor={`sale-qty-${index}`}>Quantity</Label>
                    <Input
                      id={`sale-qty-${index}`}
                      inputMode="numeric"
                      value={row.quantity}
                      onChange={(e) =>
                        updateSaleRow(index, {
                          quantity: e.target.value.replace(/[^0-9]/g, ""),
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor={`sale-total-${index}`}>Total price</Label>
                    <CurrencyInput
                      id={`sale-total-${index}`}
                      value={row.total}
                      onChange={(value) =>
                        updateSaleRow(index, { total: value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor={`sale-cash-${index}`}>Paid cash</Label>
                    <CurrencyInput
                      id={`sale-cash-${index}`}
                      value={row.cash}
                      onChange={(value) => updateSaleRow(index, { cash: value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`sale-momo-${index}`}>Paid MoMo</Label>
                    <CurrencyInput
                      id={`sale-momo-${index}`}
                      value={row.momo}
                      onChange={(value) => updateSaleRow(index, { momo: value })}
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSaleRow}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add another item
            </Button>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {saleRows.filter((row) => row.description.trim()).length} item(s)
              ready — they are saved together.
            </span>
            <Button onClick={submitSales} disabled={savingSale}>
              {savingSale ? "Saving..." : "Save all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
