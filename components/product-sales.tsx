"use client";

// Products route: the shop's own products (detergents, bleach, dish wash...)
// sold at the counter, plus hangers / covers and other extras. Everything is
// recorded here — cash, MoMo, split, or on credit — and stored in Supabase.
// The daily report only reads it, the same way it reads invoices.

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
import {
  Check,
  Download,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  ProductSaleReceipt,
  type ProductSaleReceiptData,
} from "@/components/product-sale-receipt";
import { generateProductSalePDF } from "@/lib/product-receipt-pdf";
import { formatCurrency, getLocalDateString } from "@/lib/utils";
import { PRODUCT_ITEM_NAMES, lookupItemCategory } from "@/lib/item-catalog";
import { loadItemCatalog } from "@/lib/item-catalog-db";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  addExtraSale,
  addExtraSalePayment,
  deleteExtraSale,
  extraSaleClientFieldsReady,
  fetchExtraSaleHistory,
  fetchExtraSalesForDay,
  fetchUnpaidExtraSales,
  getDayRangeIso,
  updateExtraSale,
  type ReportExtraSale,
  type UnpaidExtraSale,
} from "@/lib/daily-cash-report";

type PayMode = "cash" | "momo" | "split" | "credit";

// What the inline editor needs, whether the sale is from this day's table or
// from the "still owing" list.
type EditableSale = {
  id: string;
  description: string;
  quantity: number;
  totalPrice: number;
  amountPaidCash: number;
  amountPaidMomo: number;
  clientName?: string | null;
};

// Who is buying: a named client or a walk-in with no record.
type Buyer = "walkin" | "client";

type ClientOption = { id: string; name: string; phone: string };

const money = (value: number) => (value ? formatCurrency(value) : "—");
const toNumber = (value: string) => Number(value.replace(/[^0-9.]/g, "")) || 0;

// A sale typed for a past day is stamped at midday of that day; a sale typed
// today is stamped now, so the time on the report is the real one.
function soldAtFor(ymd: string): string {
  if (ymd === getLocalDateString()) return new Date().toISOString();
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0).toISOString();
}

// Hangers, covers and other extras are "extra"; the shop's products are
// "product". The daily report splits them the same way.
function categoryFor(description: string): "product" | "extra" {
  // The item list is the source of truth for what a thing is.
  const known = lookupItemCategory(description);
  if (known) return known === "dry_cleaning" ? "product" : known;
  return /hanger|cover|bag|bouquet|container|jerry ?can|bucket/i.test(
    description
  )
    ? "extra"
    : "product";
}

const PAY_LABELS: Record<PayMode, string> = {
  cash: "Cash",
  momo: "MoMo",
  split: "Cash + MoMo",
  credit: "On credit",
};

export function ProductSales() {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [sales, setSales] = useState<ReportExtraSale[]>([]);
  const [unpaid, setUnpaid] = useState<UnpaidExtraSale[]>([]);
  const [loading, setLoading] = useState(false);

  const [description, setDescription] = useState(PRODUCT_ITEM_NAMES[0] || "");
  const [quantity, setQuantity] = useState("1");
  const [amount, setAmount] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("cash");
  const [splitCash, setSplitCash] = useState("");
  const [splitMomo, setSplitMomo] = useState("");
  const [saving, setSaving] = useState(false);

  // --- who is buying -----------------------------------------------------
  // Every sale is either for a named client or a walk-in customer. Until
  // scripts/add-extra-sale-client.sql has been run the columns don't exist,
  // so sales are recorded without a client rather than failing.
  const [buyer, setBuyer] = useState<Buyer>("walkin");
  const [clientQuery, setClientQuery] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientFieldsReady, setClientFieldsReady] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ready = await extraSaleClientFieldsReady();
      if (!cancelled) setClientFieldsReady(ready);
      const { data } = await supabase
        .from("clients")
        .select("id, name, phone")
        .order("name");
      if (!cancelled) setClients((data || []) as ClientOption[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buyerName = buyer === "client" ? clientQuery.trim() : "";
  const chosenClient = buyerName
    ? clients.find((c) => c.name.toLowerCase() === buyerName.toLowerCase())
    : undefined;
  // Suggestions stay hidden once the typed name is an exact match.
  const clientMatches = buyerName && !chosenClient
    ? clients
        .filter(
          (c) =>
            c.name.toLowerCase().includes(buyerName.toLowerCase()) ||
            (buyerName.length > 2 && c.phone.includes(buyerName))
        )
        .slice(0, 6)
    : [];

  // --- past records ------------------------------------------------------
  const [history, setHistory] = useState<ReportExtraSale[]>([]);
  const [historyLimit, setHistoryLimit] = useState(50);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchExtraSaleHistory(historyLimit));
    } catch {
      setHistory([]);
    }
  }, [historyLimit]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const load = useCallback(async (ymd: string) => {
    setLoading(true);
    try {
      // Fresh item names before the dropdown is drawn.
      await loadItemCatalog();
      setDescription((previous) =>
        PRODUCT_ITEM_NAMES.includes(previous)
          ? previous
          : PRODUCT_ITEM_NAMES[0] || ""
      );
      const salesForDay = await fetchExtraSalesForDay(ymd);
      setSales(salesForDay);
      setLoadedDate(ymd);
      const { fromIso } = getDayRangeIso(ymd);
      setUnpaid(await fetchUnpaidExtraSales(fromIso));
    } catch (error: any) {
      setSales([]);
      setLoadedDate(null);
      toast({
        title: "Could not load product sales",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(selectedDate);
  }, [load, selectedDate]);

  // Save / delete / collect all refresh the day, what is still owed, and the
  // past-records list together.
  const refresh = useCallback(
    async (ymd: string) => {
      await load(ymd);
      await loadHistory();
    },
    [load, loadHistory]
  );

  const totals = useMemo(
    () =>
      sales.reduce(
        (sum, sale) => {
          const balance = Math.max(
            0,
            sale.totalPrice - (sale.amountPaidCash + sale.amountPaidMomo)
          );
          return {
            qty: sum.qty + sale.quantity,
            total: sum.total + sale.totalPrice,
            cash: sum.cash + sale.amountPaidCash,
            momo: sum.momo + sale.amountPaidMomo,
            balance: sum.balance + balance,
          };
        },
        { qty: 0, total: 0, cash: 0, momo: 0, balance: 0 }
      ),
    [sales]
  );

  // What is being typed: payment mode decides the cash/MoMo split.
  const amountValue = toNumber(amount);
  const draftCash =
    payMode === "cash" ? amountValue : payMode === "split" ? toNumber(splitCash) : 0;
  const draftMomo =
    payMode === "momo" ? amountValue : payMode === "split" ? toNumber(splitMomo) : 0;
  const draftBalance = Math.max(0, amountValue - draftCash - draftMomo);

  const resetDraft = () => {
    setQuantity("1");
    setAmount("");
    setPayMode("cash");
    setSplitCash("");
    setSplitMomo("");
    setBuyer("walkin");
    setClientQuery("");
  };

  const changeQuantity = (delta: number) => {
    const next = Math.max(1, (Number(quantity) || 1) + delta);
    setQuantity(String(next));
  };

  const submitSale = async () => {
    if (!description.trim()) {
      toast({ title: "Choose the product", variant: "destructive" });
      return;
    }
    if (amountValue <= 0) {
      toast({ title: "Enter the amount", variant: "destructive" });
      return;
    }
    if (buyer === "client" && !buyerName) {
      toast({
        title: "Enter the client, or choose Walk-in customer",
        variant: "destructive",
      });
      return;
    }
    if (draftCash + draftMomo > amountValue + 0.5) {
      toast({
        title: "Paid more than the amount",
        description: "Check the cash and MoMo parts.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await addExtraSale({
        soldAt: soldAtFor(selectedDate),
        category: categoryFor(description),
        description: description.trim(),
        quantity: Math.max(1, Math.round(Number(quantity) || 1)),
        totalPrice: amountValue,
        amountPaidCash: draftCash,
        amountPaidMomo: draftMomo,
        ...(clientFieldsReady
          ? {
              clientId: chosenClient?.id ?? null,
              clientName: buyerName || null,
            }
          : {}),
      });
      resetDraft();
      await refresh(selectedDate);
      toast({ title: `${description} recorded` });
    } catch (error: any) {
      toast({
        title: "Could not save the sale",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeSale = async (sale: { id: string }) => {
    try {
      await deleteExtraSale(sale.id);
      await refresh(selectedDate);
      toast({ title: "Sale deleted" });
    } catch (error: any) {
      toast({
        title: "Could not delete the sale",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  // --- edit a recorded sale, right in its row -----------------------------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("1");
  const [editAmount, setEditAmount] = useState("");
  const [editCash, setEditCash] = useState("");
  const [editMomo, setEditMomo] = useState("");
  const [editClient, setEditClient] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (sale: EditableSale) => {
    setEditingId(sale.id);
    setEditClient(sale.clientName || "");
    setEditName(sale.description);
    setEditQuantity(String(sale.quantity));
    setEditAmount(String(Math.round(sale.totalPrice)));
    setEditCash(
      sale.amountPaidCash ? String(Math.round(sale.amountPaidCash)) : ""
    );
    setEditMomo(
      sale.amountPaidMomo ? String(Math.round(sale.amountPaidMomo)) : ""
    );
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (sale: { id: string }) => {
    const newAmount = toNumber(editAmount);
    const newCash = toNumber(editCash);
    const newMomo = toNumber(editMomo);
    if (!editName.trim()) {
      toast({ title: "Choose the product", variant: "destructive" });
      return;
    }
    if (newAmount <= 0) {
      toast({ title: "Enter the amount", variant: "destructive" });
      return;
    }
    if (newCash + newMomo > newAmount + 0.5) {
      toast({
        title: "Paid more than the amount",
        description: "Check the cash and MoMo parts.",
        variant: "destructive",
      });
      return;
    }

    setSavingEdit(true);
    try {
      const editBuyerName = editClient.trim();
      const editClientMatch = editBuyerName
        ? clients.find(
            (c) => c.name.toLowerCase() === editBuyerName.toLowerCase()
          )
        : undefined;
      await updateExtraSale(sale.id, {
        description: editName.trim(),
        category: categoryFor(editName),
        quantity: Math.max(1, Math.round(Number(editQuantity) || 1)),
        totalPrice: newAmount,
        amountPaidCash: newCash,
        amountPaidMomo: newMomo,
        ...(clientFieldsReady
          ? {
              clientId: editClientMatch?.id ?? null,
              clientName: editBuyerName || null,
            }
          : {}),
      });
      setEditingId(null);
      await refresh(selectedDate);
      toast({ title: "Sale updated" });
    } catch (error: any) {
      toast({
        title: "Could not update the sale",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  // --- the receipt for one sale -------------------------------------------
  // Clicking any sale row shows it, and it can be downloaded as a PDF.
  const [receiptSale, setReceiptSale] = useState<ProductSaleReceiptData | null>(
    null
  );
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  const downloadReceipt = async (sale: ProductSaleReceiptData) => {
    setDownloadingReceipt(true);
    try {
      await generateProductSalePDF(sale);
      toast({ title: "Receipt downloaded" });
    } catch (error: any) {
      toast({
        title: "Could not create the receipt",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingReceipt(false);
    }
  };

  // --- collecting what is still owed on an earlier product sale -----------
  const [collectSale, setCollectSale] = useState<UnpaidExtraSale | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<"CASH" | "MOMO">("CASH");
  const [savingCollect, setSavingCollect] = useState(false);

  const openCollect = (sale: UnpaidExtraSale) => {
    setCollectSale(sale);
    setCollectAmount(String(Math.round(sale.balance)));
    setCollectMethod("CASH");
  };

  const submitCollect = async () => {
    if (!collectSale) return;
    const value = toNumber(collectAmount);
    if (value <= 0) {
      toast({ title: "Enter the amount received", variant: "destructive" });
      return;
    }
    if (value > collectSale.balance + 0.5) {
      toast({
        title: "That is more than the balance",
        description: `Only ${formatCurrency(collectSale.balance)} is still owed.`,
        variant: "destructive",
      });
      return;
    }

    setSavingCollect(true);
    try {
      await addExtraSalePayment({
        extraSaleId: collectSale.id,
        amount: value,
        method: collectMethod,
        paidAt: soldAtFor(selectedDate),
      });
      setCollectSale(null);
      await refresh(selectedDate);
      toast({ title: `${formatCurrency(value)} collected` });
    } catch (error: any) {
      toast({
        title: "Could not save the payment",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingCollect(false);
    }
  };

  const cell = "border border-border px-2 py-1";

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Products sold</h1>
          <p className="text-sm text-muted-foreground">
            The shop&apos;s products, hangers and covers — cash, MoMo, or on
            credit.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/items">
            <Button variant="ghost" size="sm">
              <Tag className="mr-2 h-4 w-4" /> Item list
            </Button>
          </Link>
          <Input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="w-40"
          />
          <Button
            variant="outline"
            onClick={() => load(selectedDate)}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 pb-10">
        {/* --- new sale ------------------------------------------------- */}
        <div className="mb-6 rounded-lg border p-4">
          <p className="mb-3 text-base font-semibold">Sell a product</p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Label htmlFor="product-name">Product</Label>
              <select
                id="product-name"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PRODUCT_ITEM_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Quantity</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => changeQuantity(-1)}
                  disabled={Number(quantity) <= 1}
                  title="One less"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  value={quantity}
                  inputMode="numeric"
                  onChange={(event) =>
                    setQuantity(event.target.value.replace(/[^0-9]/g, ""))
                  }
                  className="w-16 text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => changeQuantity(1)}
                  title="One more"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="product-amount">Amount to pay</Label>
              <CurrencyInput
                id="product-amount"
                value={amount}
                onChange={setAmount}
                placeholder="0"
              />
            </div>

            <div className="sm:col-span-2">
              <Label>How are they paying?</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PAY_LABELS) as PayMode[]).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={payMode === mode ? "default" : "outline"}
                    onClick={() => setPayMode(mode)}
                  >
                    {PAY_LABELS[mode]}
                  </Button>
                ))}
              </div>
            </div>

            {payMode === "split" && (
              <>
                <div>
                  <Label htmlFor="split-cash">Cash part</Label>
                  <CurrencyInput
                    id="split-cash"
                    value={splitCash}
                    onChange={setSplitCash}
                  />
                </div>
                <div>
                  <Label htmlFor="split-momo">MoMo part</Label>
                  <CurrencyInput
                    id="split-momo"
                    value={splitMomo}
                    onChange={setSplitMomo}
                  />
                </div>
              </>
            )}
          </div>

          <div className="mt-4">
            <Label>Client</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={buyer === "walkin" ? "default" : "outline"}
                onClick={() => {
                  setBuyer("walkin");
                  setClientQuery("");
                }}
              >
                Walk-in customer
              </Button>
              <Button
                type="button"
                size="sm"
                variant={buyer === "client" ? "default" : "outline"}
                onClick={() => setBuyer("client")}
                disabled={!clientFieldsReady}
              >
                Named client
              </Button>
              {buyer === "client" && (
                <div className="relative min-w-[14rem] flex-1">
                  <Input
                    value={clientQuery}
                    onChange={(event) => setClientQuery(event.target.value)}
                    placeholder="Client name or phone"
                    autoFocus
                  />
                  {clientMatches.length > 0 && (
                    <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-background shadow-md">
                      {clientMatches.map((client) => (
                        <li key={client.id}>
                          <button
                            type="button"
                            onClick={() => setClientQuery(client.name)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                          >
                            {client.name}
                            {client.phone ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {client.phone}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {buyer === "client" && chosenClient && (
              <p className="mt-1 text-xs text-muted-foreground">
                Linked to the existing client record.
              </p>
            )}
            {!clientFieldsReady && (
              <p className="mt-1 text-xs text-amber-700">
                Clients can&apos;t be saved yet — run
                scripts/add-extra-sale-client.sql in Supabase. Sales are
                recorded as walk-in until then.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {payMode === "credit" ? (
                <span>
                  They will owe{" "}
                  <span className="font-semibold text-red-600">
                    {formatCurrency(amountValue)}
                  </span>{" "}
                  — collect it later from the list below.
                </span>
              ) : (
                <span>
                  Paying now: {formatCurrency(draftCash + draftMomo)}
                  {draftBalance > 0 && (
                    <>
                      {" "}
                      · owing{" "}
                      <span className="font-semibold text-red-600">
                        {formatCurrency(draftBalance)}
                      </span>
                    </>
                  )}
                </span>
              )}
            </p>
            <Button onClick={submitSale} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save sale"}
            </Button>
          </div>
        </div>

        {/* --- the day's sales ------------------------------------------ */}
        <div className="mb-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold">
              Sold on {loadedDate ? loadedDate : selectedDate}
            </h2>
            <p className="text-xs text-muted-foreground">
              Pencil changes the row right here · Enter saves · Esc cancels ·
              trash deletes · click a row for its receipt.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                                      <th className={`${cell} text-left`}>Product</th>
                    <th className={`${cell} text-left`}>Client</th>
                    <th className={`${cell} text-right`}>Quantity</th>
                    <th className={`${cell} text-right`}>Amount</th>
                    <th className={`${cell} text-right`}>Cash</th>
                    <th className={`${cell} text-right`}>MoMo</th>
                    <th className={`${cell} text-right`}>Owing</th>
                    <th className={cell} />
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && (
                  <tr>
                    <td className={`${cell} text-muted-foreground`} colSpan={8}>
                      Nothing sold on this day.
                    </td>
                  </tr>
                )}
                {sales.map((sale) => {
                  if (editingId === sale.id) {
                    const rowBalance = Math.max(
                      0,
                      toNumber(editAmount) -
                        toNumber(editCash) -
                        toNumber(editMomo)
                    );
                    return (
                      <tr
                        key={sale.id}
                        className="bg-muted/40"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveEdit(sale);
                          }
                          if (event.key === "Escape") cancelEdit();
                        }}
                      >
                        <td className={cell}>
                          <select
                            value={editName}
                            autoFocus
                            onChange={(event) => setEditName(event.target.value)}
                            className="h-8 w-full min-w-[10rem] rounded border border-input bg-background px-1 text-sm"
                          >
                            {/* A sale may carry a name that is no longer in the list. */}
                            {!PRODUCT_ITEM_NAMES.includes(editName) && editName && (
                              <option value={editName}>{editName}</option>
                            )}
                            {PRODUCT_ITEM_NAMES.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={cell}>
                          <input
                            value={editClient}
                            placeholder="Walk-in"
                            onChange={(event) =>
                              setEditClient(event.target.value)
                            }
                            className="h-8 w-32 rounded border border-input bg-background px-1 text-sm"
                          />
                        </td>
                        <td className={`${cell} text-right`}>
                          <input
                            value={editQuantity}
                            inputMode="numeric"
                            onChange={(event) =>
                              setEditQuantity(
                                event.target.value.replace(/[^0-9]/g, "")
                              )
                            }
                            className="h-8 w-12 rounded border border-input bg-background px-1 text-right text-sm"
                          />
                        </td>
                        <td className={`${cell} text-right`}>
                          <CurrencyInput
                            value={editAmount}
                            onChange={setEditAmount}
                            className="h-8 w-20 text-right"
                          />
                        </td>
                        <td className={`${cell} text-right`}>
                          <CurrencyInput
                            value={editCash}
                            onChange={setEditCash}
                            className="h-8 w-20 text-right"
                          />
                        </td>
                        <td className={`${cell} text-right`}>
                          <CurrencyInput
                            value={editMomo}
                            onChange={setEditMomo}
                            className="h-8 w-20 text-right"
                          />
                        </td>
                        <td
                          className={`${cell} text-right ${
                            rowBalance > 0 ? "font-bold text-red-600" : ""
                          }`}
                        >
                          {money(rowBalance)}
                        </td>
                        <td className={`${cell} whitespace-nowrap text-center`}>
                          <button
                            type="button"
                            title="Save (Enter)"
                            onClick={() => saveEdit(sale)}
                            disabled={savingEdit}
                            className="mr-2 text-green-700 hover:text-green-900"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Cancel (Esc)"
                            onClick={cancelEdit}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  const balance = Math.max(
                    0,
                    sale.totalPrice - (sale.amountPaidCash + sale.amountPaidMomo)
                  );
                  return (
                    <tr
                      key={sale.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setReceiptSale(sale)}
                      title="Open the receipt"
                    >
                      <td className={cell}>{sale.description}</td>
                      <td className={cell}>{sale.clientName || "Walk-in"}</td>
                      <td className={`${cell} text-right`}>{sale.quantity}</td>
                      <td className={`${cell} text-right`}>
                        {money(sale.totalPrice)}
                      </td>
                      <td className={`${cell} text-right`}>
                        {money(sale.amountPaidCash)}
                      </td>
                      <td className={`${cell} text-right`}>
                        {money(sale.amountPaidMomo)}
                      </td>
                      <td
                        className={`${cell} text-right ${
                          balance > 0 ? "font-bold text-red-600" : ""
                        }`}
                      >
                        {money(balance)}
                      </td>
                      <td className={`${cell} whitespace-nowrap text-center`}>
                        <button
                          type="button"
                          title="Edit this sale"
                          onClick={(event) => {
                            event.stopPropagation();
                            startEdit(sale);
                          }}
                          className="mr-2 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete this sale"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeSale(sale);
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className={cell}>TOTAL</td>
                  <td className={cell} />
                  <td className={`${cell} text-right`}>{totals.qty}</td>
                  <td className={`${cell} text-right`}>
                    {formatCurrency(totals.total)}
                  </td>
                  <td className={`${cell} text-right`}>
                    {formatCurrency(totals.cash)}
                  </td>
                  <td className={`${cell} text-right`}>
                    {formatCurrency(totals.momo)}
                  </td>
                  <td className={`${cell} text-right text-red-600`}>
                    {formatCurrency(totals.balance)}
                  </td>
                  <td className={cell} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* --- older sales still owed ----------------------------------- */}
        {unpaid.length > 0 && (
          <div className="mb-10 rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">
                Still owing — from earlier days
              </p>
              <p className="text-xs text-muted-foreground">
                Editable like today&apos;s rows · Collect records money handed
                over now.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className={`${cell} text-left`}>Product</th>
                    <th className={`${cell} text-left`}>Client</th>
                    <th className={`${cell} text-right`}>Quantity</th>
                    <th className={`${cell} text-right`}>Amount</th>
                    <th className={`${cell} text-right`}>Cash</th>
                    <th className={`${cell} text-right`}>MoMo</th>
                    <th className={`${cell} text-right`}>Collected</th>
                    <th className={`${cell} text-right`}>Owing</th>
                    <th className={`${cell} text-left`}>Sold</th>
                    <th className={cell} />
                  </tr>
                </thead>
                <tbody>
                  {unpaid.map((sale) => {
                    const soldOn = new Date(sale.soldAt).toLocaleDateString();

                    if (editingId === sale.id) {
                      const rowOwing = Math.max(
                        0,
                        toNumber(editAmount) -
                          toNumber(editCash) -
                          toNumber(editMomo) -
                          sale.collected
                      );
                      return (
                        <tr
                          key={sale.id}
                          className="bg-muted/40"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              saveEdit(sale);
                            }
                            if (event.key === "Escape") cancelEdit();
                          }}
                        >
                          <td className={cell}>
                            <select
                              value={editName}
                              autoFocus
                              onChange={(event) =>
                                setEditName(event.target.value)
                              }
                              className="h-8 w-full min-w-[10rem] rounded border border-input bg-background px-1 text-sm"
                            >
                              {!PRODUCT_ITEM_NAMES.includes(editName) &&
                                editName && (
                                  <option value={editName}>{editName}</option>
                                )}
                              {PRODUCT_ITEM_NAMES.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={cell}>
                            <input
                              value={editClient}
                              placeholder="Walk-in"
                              onChange={(event) =>
                                setEditClient(event.target.value)
                              }
                              className="h-8 w-32 rounded border border-input bg-background px-1 text-sm"
                            />
                          </td>
                          <td className={`${cell} text-right`}>
                            <input
                              value={editQuantity}
                              inputMode="numeric"
                              onChange={(event) =>
                                setEditQuantity(
                                  event.target.value.replace(/[^0-9]/g, "")
                                )
                              }
                              className="h-8 w-12 rounded border border-input bg-background px-1 text-right text-sm"
                            />
                          </td>
                          <td className={`${cell} text-right`}>
                            <CurrencyInput
                              value={editAmount}
                              onChange={setEditAmount}
                              className="h-8 w-20 text-right"
                            />
                          </td>
                          <td className={`${cell} text-right`}>
                            <CurrencyInput
                              value={editCash}
                              onChange={setEditCash}
                              className="h-8 w-20 text-right"
                            />
                          </td>
                          <td className={`${cell} text-right`}>
                            <CurrencyInput
                              value={editMomo}
                              onChange={setEditMomo}
                              className="h-8 w-20 text-right"
                            />
                          </td>
                          <td className={`${cell} text-right`}>
                            {money(sale.collected)}
                          </td>
                          <td
                            className={`${cell} text-right ${
                              rowOwing > 0 ? "font-bold text-red-600" : ""
                            }`}
                          >
                            {money(rowOwing)}
                          </td>
                          <td
                            className={`${cell} whitespace-nowrap text-muted-foreground`}
                          >
                            {soldOn}
                          </td>
                          <td
                            className={`${cell} whitespace-nowrap text-center`}
                          >
                            <button
                              type="button"
                              title="Save (Enter)"
                              onClick={() => saveEdit(sale)}
                              disabled={savingEdit}
                              className="mr-2 text-green-700 hover:text-green-900"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Cancel (Esc)"
                              onClick={cancelEdit}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={sale.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setReceiptSale(sale)}
                        title="Open the receipt"
                      >
                        <td className={cell}>{sale.description}</td>
                        <td className={cell}>{sale.clientName || "Walk-in"}</td>
                        <td className={`${cell} text-right`}>
                          {sale.quantity}
                        </td>
                        <td className={`${cell} text-right`}>
                          {money(sale.totalPrice)}
                        </td>
                        <td className={`${cell} text-right`}>
                          {money(sale.amountPaidCash)}
                        </td>
                        <td className={`${cell} text-right`}>
                          {money(sale.amountPaidMomo)}
                        </td>
                        <td className={`${cell} text-right`}>
                          {money(sale.collected)}
                        </td>
                        <td
                          className={`${cell} text-right font-bold text-red-600`}
                        >
                          {formatCurrency(sale.balance)}
                        </td>
                        <td
                          className={`${cell} whitespace-nowrap text-muted-foreground`}
                        >
                          {soldOn}
                        </td>
                        <td
                          className={`${cell} whitespace-nowrap text-center`}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            className="mr-2 h-7 px-2"
                                                              onClick={(event) => {
                                    event.stopPropagation();
                                    openCollect(sale);
                                  }}
                          >
                            Collect
                          </Button>
                          <button
                            type="button"
                            title="Edit this sale"
                            onClick={(event) => {
                            event.stopPropagation();
                            startEdit(sale);
                          }}
                            className="mr-2 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete this sale"
                            onClick={(event) => {
                            event.stopPropagation();
                            removeSale(sale);
                          }}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- past records ---------------------------------------------- */}
        <div className="mb-10">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold">Past records</h2>
            <p className="text-xs text-muted-foreground">
              Every product sale, newest first · pencil edits in place · trash
              deletes · click a row for its receipt.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className={`${cell} text-left`}>Product</th>
                  <th className={`${cell} text-left`}>Client</th>
                  <th className={`${cell} text-right`}>Quantity</th>
                  <th className={`${cell} text-right`}>Amount</th>
                  <th className={`${cell} text-right`}>Cash</th>
                  <th className={`${cell} text-right`}>MoMo</th>
                  <th className={`${cell} text-right`}>Owing</th>
                  <th className={`${cell} text-left`}>Sold</th>
                  <th className={cell} />
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr>
                    <td className={`${cell} text-muted-foreground`} colSpan={9}>
                      No product sales recorded yet.
                    </td>
                  </tr>
                )}
                {history.map((sale) => {
                  const soldOn = new Date(sale.soldAt).toLocaleDateString();
                  const collected = sale.collected || 0;

                  if (editingId === sale.id) {
                    const rowOwing = Math.max(
                      0,
                      toNumber(editAmount) -
                        toNumber(editCash) -
                        toNumber(editMomo) -
                        collected
                    );
                    return (
                      <tr
                        key={sale.id}
                        className="bg-muted/40"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveEdit(sale);
                          }
                          if (event.key === "Escape") cancelEdit();
                        }}
                      >
                        <td className={cell}>
                          <select
                            value={editName}
                            autoFocus
                            onChange={(event) =>
                              setEditName(event.target.value)
                            }
                            className="h-8 w-full min-w-[10rem] rounded border border-input bg-background px-1 text-sm"
                          >
                            {!PRODUCT_ITEM_NAMES.includes(editName) &&
                              editName && (
                                <option value={editName}>{editName}</option>
                              )}
                            {PRODUCT_ITEM_NAMES.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={cell}>
                          <input
                            value={editClient}
                            placeholder="Walk-in"
                            onChange={(event) =>
                              setEditClient(event.target.value)
                            }
                            className="h-8 w-32 rounded border border-input bg-background px-1 text-sm"
                          />
                        </td>
                        <td className={`${cell} text-right`}>
                          <input
                            value={editQuantity}
                            inputMode="numeric"
                            onChange={(event) =>
                              setEditQuantity(
                                event.target.value.replace(/[^0-9]/g, "")
                              )
                            }
                            className="h-8 w-12 rounded border border-input bg-background px-1 text-right text-sm"
                          />
                        </td>
                        <td className={`${cell} text-right`}>
                          <CurrencyInput
                            value={editAmount}
                            onChange={setEditAmount}
                            className="h-8 w-20 text-right"
                          />
                        </td>
                        <td className={`${cell} text-right`}>
                          <CurrencyInput
                            value={editCash}
                            onChange={setEditCash}
                            className="h-8 w-20 text-right"
                          />
                        </td>
                        <td className={`${cell} text-right`}>
                          <CurrencyInput
                            value={editMomo}
                            onChange={setEditMomo}
                            className="h-8 w-20 text-right"
                          />
                        </td>
                        <td
                          className={`${cell} text-right ${
                            rowOwing > 0 ? "font-bold text-red-600" : ""
                          }`}
                        >
                          {money(rowOwing)}
                        </td>
                        <td
                          className={`${cell} whitespace-nowrap text-muted-foreground`}
                        >
                          {soldOn}
                        </td>
                        <td
                          className={`${cell} whitespace-nowrap text-center`}
                        >
                          <button
                            type="button"
                            title="Save (Enter)"
                            onClick={() => saveEdit(sale)}
                            disabled={savingEdit}
                            className="mr-2 text-green-700 hover:text-green-900"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Cancel (Esc)"
                            onClick={cancelEdit}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  const balance = Math.max(
                    0,
                    sale.totalPrice -
                      (sale.amountPaidCash +
                        sale.amountPaidMomo +
                        collected)
                  );
                  return (
                    <tr
                      key={sale.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setReceiptSale(sale)}
                      title="Open the receipt"
                    >
                      <td className={cell}>{sale.description}</td>
                      <td className={cell}>{sale.clientName || "Walk-in"}</td>
                      <td className={`${cell} text-right`}>
                        {sale.quantity}
                      </td>
                      <td className={`${cell} text-right`}>
                        {money(sale.totalPrice)}
                      </td>
                      <td className={`${cell} text-right`}>
                        {money(sale.amountPaidCash)}
                      </td>
                      <td className={`${cell} text-right`}>
                        {money(sale.amountPaidMomo)}
                      </td>
                      <td
                        className={`${cell} text-right ${
                          balance > 0 ? "font-bold text-red-600" : ""
                        }`}
                      >
                        {money(balance)}
                      </td>
                      <td
                        className={`${cell} whitespace-nowrap text-muted-foreground`}
                      >
                        {soldOn}
                      </td>
                      <td className={`${cell} whitespace-nowrap text-center`}>
                        <button
                          type="button"
                          title="Edit this sale"
                          onClick={(event) => {
                            event.stopPropagation();
                            startEdit(sale);
                          }}
                          className="mr-2 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete this sale"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeSale(sale);
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {history.length >= historyLimit && (
            <div className="mt-2 text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHistoryLimit((n) => n + 50)}
                disabled={loading}
              >
                Show older sales
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* --- collect dialog --------------------------------------------- */}
      <Dialog
        open={Boolean(collectSale)}
        onOpenChange={(open) => !open && setCollectSale(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Collect product money</DialogTitle>
            <DialogDescription>
              {collectSale?.description} × {collectSale?.quantity} — owing{" "}
              {formatCurrency(collectSale?.balance || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="collect-amount">Amount received</Label>
              <CurrencyInput
                id="collect-amount"
                value={collectAmount}
                onChange={setCollectAmount}
              />
            </div>
            <div>
              <Label>Received on</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={collectMethod === "CASH" ? "default" : "outline"}
                  onClick={() => setCollectMethod("CASH")}
                >
                  Cash
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={collectMethod === "MOMO" ? "default" : "outline"}
                  onClick={() => setCollectMethod("MOMO")}
                >
                  MoMo
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Shows on the daily report page 2 for that date.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={submitCollect} disabled={savingCollect}>
              {savingCollect ? "Saving..." : "Save payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- receipt for one sale --------------------------------------- */}
      <Dialog
        open={Boolean(receiptSale)}
        onOpenChange={(open) => !open && setReceiptSale(null)}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Receipt</DialogTitle>
            <DialogDescription>
              {receiptSale
                ? `${receiptSale.description} × ${receiptSale.quantity} · ${
                    receiptSale.clientName || "Walk-in customer"
                  }`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {receiptSale && (
            <div className="max-h-[60vh] overflow-auto rounded-md border bg-white p-2">
              <div style={{ zoom: 0.62 }}>
                <ProductSaleReceipt sale={receiptSale} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <p className="text-xs text-muted-foreground">
              A4 PDF named receipt-{receiptSale?.id.slice(0, 8)} …
            </p>
            <Button
              onClick={() => receiptSale && downloadReceipt(receiptSale)}
              disabled={downloadingReceipt || !receiptSale}
            >
              <Download className="mr-2 h-4 w-4" />
              {downloadingReceipt ? "Preparing..." : "Download PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
