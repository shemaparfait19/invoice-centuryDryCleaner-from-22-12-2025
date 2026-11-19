"use client";

// The shop's item list, edited here.
//
// Every name used on an invoice or a product sale comes from this list, and the
// category decides where it is counted on the daily cash report: dry cleaning
// (clothes), product, or extra (hangers, covers, bags, containers...).
// Rows edit in place — pencil opens the row, Enter saves, Esc cancels, trash
// deletes immediately.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import {
  ITEM_CATEGORIES,
  CATEGORY_LABELS,
  getBuiltInCatalogItems,
  type CatalogItem,
  type ItemCategory,
} from "@/lib/item-catalog";
import {
  ITEM_CATALOG_SQL,
  createCatalogItem,
  deleteCatalogItem,
  importBuiltInCatalog,
  itemCatalogTableMissing,
  loadItemCatalog,
  updateCatalogItem,
  type CatalogRecord,
} from "@/lib/item-catalog-db";
import { toast } from "@/hooks/use-toast";

const aliasesText = (record: CatalogRecord) => record.aliases.join(", ");

// Usual spelling variations kept for the staff, so "jik" still matches bleach.
const extraAliases = (value: string) =>
  value
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);

export function ItemCatalogManager() {
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ItemCategory>("dry_cleaning");
  const [aliases, setAliases] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<ItemCategory>("dry_cleaning");
  const [editAliases, setEditAliases] = useState("");

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ItemCategory>(
    "all"
  );

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const rows = await loadItemCatalog(force);
      setRecords(rows);
      setMissingTable(itemCatalogTableMissing());
    } catch (error: any) {
      toast({
        title: "Could not load the item list",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const saveCatalog = useCallback((rows: CatalogRecord[]) => {
    setRecords(rows);
  }, []);

  const addItem = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Give the item a name", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createCatalogItem({
        name: trimmed,
        category,
        aliases: extraAliases(aliases),
      });
      const rows = await loadItemCatalog();
      saveCatalog(rows);
      setName("");
      setAliases("");
      toast({ title: `${trimmed} added` });
    } catch (error: any) {
      toast({
        title: "Could not add the item",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (record: CatalogRecord) => {
    setEditingId(record.id);
    setEditName(record.name);
    setEditCategory(record.category);
    setEditAliases(aliasesText(record));
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (record: CatalogRecord) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      toast({ title: "Give the item a name", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateCatalogItem(record.id, {
        name: trimmed,
        category: editCategory,
        aliases: extraAliases(editAliases),
      });
      saveCatalog(await loadItemCatalog());
      setEditingId(null);
      toast({ title: "Item updated" });
    } catch (error: any) {
      toast({
        title: "Could not update the item",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (record: CatalogRecord) => {
    setSaving(true);
    try {
      await deleteCatalogItem(record.id);
      saveCatalog(await loadItemCatalog());
      if (editingId === record.id) setEditingId(null);
      toast({ title: `${record.name} deleted` });
    } catch (error: any) {
      toast({
        title: "Could not delete the item",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const importBuiltIns = async () => {
    const builtIn: CatalogItem[] = getBuiltInCatalogItems();
    setSaving(true);
    try {
      const count = await importBuiltInCatalog(builtIn);
      saveCatalog(await loadItemCatalog());
      toast({ title: `${count} items saved to the list` });
    } catch (error: any) {
      toast({
        title: "Could not save the built-in list",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const out: Record<ItemCategory, number> = {
      dry_cleaning: 0,
      product: 0,
      extra: 0,
    };
    for (const record of records) out[record.category] += 1;
    return out;
  }, [records]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((record) => {
      if (categoryFilter !== "all" && record.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        record.name.toLowerCase().includes(q) ||
        record.aliases.some((alias) => alias.toLowerCase().includes(q))
      );
    });
  }, [records, query, categoryFilter]);

  const cell = "border border-border px-2 py-1";

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Items &amp; categories</h1>
          <p className="text-sm text-muted-foreground">
            The names staff pick on invoices and product sales. The category
            decides where the item is counted on the daily cash report.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => load(true)}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      <div className="container mx-auto px-4 pb-10">
        {missingTable && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">The item list table is not set up yet.</p>
            <p className="mt-1">
              Open Supabase → SQL Editor, run{" "}
              <code className="rounded bg-red-100 px-1">{ITEM_CATALOG_SQL}</code>
              , then press Refresh. Until then the app keeps using its built-in
              list.
            </p>
          </div>
        )}

        {!missingTable && !loading && records.length === 0 && (
          <div className="mb-6 rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-semibold">Your list is empty.</p>
            <p className="mt-1 text-muted-foreground">
              Copy the built-in list (the clothes, detergents, hangers and
              covers the app already knows) into the database, then edit it.
            </p>
            <Button
              className="mt-3"
              onClick={importBuiltIns}
              disabled={saving}
            >
              <Plus className="mr-2 h-4 w-4" />
              Save the built-in list ({getBuiltInCatalogItems().length} items)
            </Button>
          </div>
        )}

        {/* --- add an item ------------------------------------------------ */}
        <div className="mb-6 rounded-lg border p-4">
          <p className="mb-3 text-base font-semibold">Add an item</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <Label htmlFor="new-item-name">Name</Label>
              <Input
                id="new-item-name"
                value={name}
                placeholder="Socks, Bleach, Container..."
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addItem();
                }}
              />
            </div>
            <div>
              <Label htmlFor="new-item-category">Category</Label>
              <select
                id="new-item-category"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as ItemCategory)
                }
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {ITEM_CATEGORIES.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="new-item-aliases">Also called (optional)</Label>
              <Input
                id="new-item-aliases"
                value={aliases}
                placeholder="containers, jerrycan, bucket"
                onChange={(event) => setAliases(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addItem();
                }}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={addItem} disabled={saving} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add item
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {ITEM_CATEGORIES.find((entry) => entry.key === category)?.hint}
          </p>
        </div>

        {/* --- filters ---------------------------------------------------- */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="item-search">Search</Label>
              <Input
                id="item-search"
                value={query}
                placeholder="Name or other name"
                onChange={(event) => setQuery(event.target.value)}
                className="w-56"
              />
            </div>
            <div>
              <Label htmlFor="item-category-filter">Category</Label>
              <select
                id="item-category-filter"
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(
                    event.target.value as "all" | ItemCategory
                  )
                }
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="all">All categories</option>
                {ITEM_CATEGORIES.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {records.length} item(s): {counts.dry_cleaning} dry cleaning ·{" "}
            {counts.product} products · {counts.extra} extras
          </p>
        </div>

        <p className="mb-2 text-xs text-muted-foreground">
          Pencil changes the row right here · Enter saves · Esc cancels · trash
          deletes straight away.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className={`${cell} text-left`}>Name</th>
                <th className={`${cell} text-left`}>Category</th>
                <th className={`${cell} text-left`}>Also called</th>
                <th className={cell} />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td className={`${cell} text-muted-foreground`} colSpan={4}>
                    {records.length === 0
                      ? "No items saved yet."
                      : "No items match this search."}
                  </td>
                </tr>
              )}
              {visible.map((record) => {
                if (editingId === record.id) {
                  return (
                    <tr
                      key={record.id}
                      className="bg-muted/40"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveEdit(record);
                        }
                        if (event.key === "Escape") cancelEdit();
                      }}
                    >
                      <td className={cell}>
                        <Input
                          value={editName}
                          autoFocus
                          onChange={(event) => setEditName(event.target.value)}
                          className="h-8 min-w-[10rem]"
                        />
                      </td>
                      <td className={cell}>
                        <select
                          value={editCategory}
                          onChange={(event) =>
                            setEditCategory(event.target.value as ItemCategory)
                          }
                          className="h-8 w-full rounded border border-input bg-background px-1 text-sm"
                        >
                          {ITEM_CATEGORIES.map((entry) => (
                            <option key={entry.key} value={entry.key}>
                              {entry.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={cell}>
                        <Input
                          value={editAliases}
                          placeholder="comma separated"
                          onChange={(event) => setEditAliases(event.target.value)}
                          className="h-8 min-w-[12rem]"
                        />
                      </td>
                      <td className={`${cell} whitespace-nowrap text-center`}>
                        <button
                          type="button"
                          title="Save (Enter)"
                          onClick={() => saveEdit(record)}
                          disabled={saving}
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
                  <tr key={record.id}>
                    <td className={`${cell} font-medium`}>{record.name}</td>
                    <td className={cell}>
                      <span className="rounded bg-muted px-2 py-0.5 text-xs">
                        {CATEGORY_LABELS[record.category]}
                      </span>
                    </td>
                    <td className={`${cell} text-muted-foreground`}>
                      {record.aliases.length ? record.aliases.join(", ") : "—"}
                    </td>
                    <td className={`${cell} whitespace-nowrap text-center`}>
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => startEdit(record)}
                        className="mr-3 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => removeItem(record)}
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
    </div>
  );
}
