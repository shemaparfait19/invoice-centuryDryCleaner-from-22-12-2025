"use client";

// The shop's item list and categories, edited here.
//
// Every name used on an invoice or a product sale comes from this list. Each
// category says how its items count on the daily cash report: dry cleaning
// (clothes), product, or extra (hangers, covers, bags, containers...).
// Categories are editable too — add your own, rename them, change what they
// count as, or delete an unused one.
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
  BUILT_IN_CATEGORIES,
  CATEGORY_KINDS,
  categoryLabel,
  getBuiltInCatalogItems,
  type CatalogItem,
  type CategoryKind,
} from "@/lib/item-catalog";
import {
  ITEM_CATALOG_SQL,
  ITEM_CATEGORIES_SQL,
  createCatalogItem,
  createItemCategory,
  deleteCatalogItem,
  deleteItemCategory,
  importBuiltInCatalog,
  importBuiltInCategories,
  itemCatalogTableMissing,
  itemCategoriesTableMissing,
  loadItemCatalog,
  loadItemCategories,
  updateCatalogItem,
  updateItemCategory,
  type CatalogRecord,
  type CategoryRecord,
} from "@/lib/item-catalog-db";
import { toast } from "@/hooks/use-toast";

const aliasesText = (record: CatalogRecord) => record.aliases.join(", ");

// Usual spelling variations kept for the staff, so "jik" still matches bleach.
const extraAliases = (value: string) =>
  value
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);

const kindLabel = (kind: CategoryKind) =>
  CATEGORY_KINDS.find((entry) => entry.key === kind)?.label ?? kind;

export function ItemCatalogManager() {
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [missingCategories, setMissingCategories] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("dry_cleaning");
  const [aliases, setAliases] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<string>("dry_cleaning");
  const [editAliases, setEditAliases] = useState("");

  const [categoryName, setCategoryName] = useState("");
  const [categoryKind, setCategoryKind] = useState<CategoryKind>("dry_cleaning");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryKind, setEditCategoryKind] =
    useState<CategoryKind>("dry_cleaning");

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const rows = await loadItemCatalog(force);
      const categoryRows = await loadItemCategories(force);
      setRecords(rows);
      setCategories(categoryRows);
      setMissingTable(itemCatalogTableMissing());
      setMissingCategories(itemCategoriesTableMissing());
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

  // Before the categories migration has run (or while the table is empty) the
  // app still works with its three built-in categories.
  const categoryOptions = useMemo(() => {
    if (categories.length > 0) {
      return categories.map((entry) => ({
        key: entry.key,
        label: entry.name,
      }));
    }
    return BUILT_IN_CATEGORIES.map((entry) => ({
      key: entry.key,
      label: entry.label,
    }));
  }, [categories]);

  const saveCatalog = useCallback((rows: CatalogRecord[]) => {
    setRecords(rows);
  }, []);

  const itemsPerCategory = useMemo(() => {
    const out: Record<string, number> = {};
    for (const record of records) {
      out[record.category] = (out[record.category] ?? 0) + 1;
    }
    return out;
  }, [records]);

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

  const addCategory = async () => {
    const trimmed = categoryName.trim();
    if (!trimmed) {
      toast({ title: "Give the category a name", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createItemCategory({ name: trimmed, countsAs: categoryKind });
      const rows = await loadItemCategories();
      setCategories(rows);
      setCategoryName("");
      toast({ title: `${trimmed} category added` });
    } catch (error: any) {
      toast({
        title: "Could not add the category",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEditCategory = (record: CategoryRecord) => {
    setEditingCategoryId(record.id);
    setEditCategoryName(record.name);
    setEditCategoryKind(record.countsAs);
  };

  const cancelEditCategory = () => setEditingCategoryId(null);

  const saveCategoryEdit = async (record: CategoryRecord) => {
    const trimmed = editCategoryName.trim();
    if (!trimmed) {
      toast({ title: "Give the category a name", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateItemCategory(record.id, {
        name: trimmed,
        countsAs: editCategoryKind,
      });
      const rows = await loadItemCategories();
      setCategories(rows);
      saveCatalog(await loadItemCatalog());
      setEditingCategoryId(null);
      toast({ title: "Category updated" });
    } catch (error: any) {
      toast({
        title: "Could not update the category",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeCategory = async (record: CategoryRecord) => {
    const used = itemsPerCategory[record.key] ?? 0;
    if (used > 0) {
      toast({
        title: `Move those items first`,
        description: `${record.name} still has ${used} item(s). Change their category, then delete this one.`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await deleteItemCategory(record);
      setCategories(await loadItemCategories());
      if (editingCategoryId === record.id) setEditingCategoryId(null);
      toast({ title: `${record.name} deleted` });
    } catch (error: any) {
      toast({
        title: "Could not delete the category",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveBuiltInCategories = async () => {
    setSaving(true);
    try {
      const count = await importBuiltInCategories(BUILT_IN_CATEGORIES);
      setCategories(await loadItemCategories());
      saveCatalog(await loadItemCatalog());
      toast({ title: `${count} categories saved` });
    } catch (error: any) {
      toast({
        title: "Could not save the built-in categories",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

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
            The names staff pick on invoices and product sales, and the
            categories behind them. A category decides where its items are
            counted on the daily cash report.
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

        {missingCategories && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Categories are not set up yet.</p>
            <p className="mt-1">
              Run{" "}
              <code className="rounded bg-amber-100 px-1">
                {ITEM_CATEGORIES_SQL}
              </code>{" "}
              in Supabase → SQL Editor so you can add, rename and delete
              categories. Until then the three built-in categories are used.
            </p>
          </div>
        )}

        {/* --- categories ------------------------------------------------- */}
        <div className="mb-6 rounded-lg border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-base font-semibold">Categories</p>
              <p className="text-xs text-muted-foreground">
                &quot;Counts as&quot; decides where the category&apos;s items
                land on the daily report.
              </p>
            </div>
            {!missingCategories && categories.length === 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={saveBuiltInCategories}
                disabled={saving}
              >
                <Plus className="mr-2 h-4 w-4" />
                Save the 3 built-in categories
              </Button>
            )}
          </div>

          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="new-category-name">Name</Label>
              <Input
                id="new-category-name"
                value={categoryName}
                placeholder="Bedding, Uniforms, Shoes..."
                onChange={(event) => setCategoryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addCategory();
                }}
              />
            </div>
            <div>
              <Label htmlFor="new-category-kind">Counts as</Label>
              <select
                id="new-category-kind"
                value={categoryKind}
                onChange={(event) =>
                  setCategoryKind(event.target.value as CategoryKind)
                }
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {CATEGORY_KINDS.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={addCategory}
                disabled={saving || missingCategories}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add category
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className={`${cell} text-left`}>Category</th>
                  <th className={`${cell} text-left`}>Counts as</th>
                  <th className={`${cell} text-left`}>Items</th>
                  <th className={cell} />
                </tr>
              </thead>
              <tbody>
                {categoryOptions.length === 0 && (
                  <tr>
                    <td className={`${cell} text-muted-foreground`} colSpan={4}>
                      No categories yet.
                    </td>
                  </tr>
                )}
                {categories.length === 0 &&
                  !missingCategories &&
                  categoryOptions.map((entry) => (
                    <tr key={entry.key}>
                      <td className={`${cell} font-medium`}>{entry.label}</td>
                      <td className={`${cell} text-muted-foreground`}>
                        {kindLabel(
                          BUILT_IN_CATEGORIES.find(
                            (category) => category.key === entry.key
                          )?.countsAs ?? "dry_cleaning"
                        )}
                      </td>
                      <td className={`${cell} text-muted-foreground`}>
                        {itemsPerCategory[entry.key] ?? 0}
                      </td>
                      <td className={`${cell} text-center text-xs text-muted-foreground`}>
                        built-in
                      </td>
                    </tr>
                  ))}
                {categories.map((record) => {
                  if (editingCategoryId === record.id) {
                    return (
                      <tr
                        key={record.id}
                        className="bg-muted/40"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveCategoryEdit(record);
                          }
                          if (event.key === "Escape") cancelEditCategory();
                        }}
                      >
                        <td className={cell}>
                          <Input
                            value={editCategoryName}
                            autoFocus
                            onChange={(event) =>
                              setEditCategoryName(event.target.value)
                            }
                            className="h-8 min-w-[10rem]"
                          />
                        </td>
                        <td className={cell}>
                          <select
                            value={editCategoryKind}
                            onChange={(event) =>
                              setEditCategoryKind(
                                event.target.value as CategoryKind
                              )
                            }
                            className="h-8 w-full rounded border border-input bg-background px-1 text-sm"
                          >
                            {CATEGORY_KINDS.map((entry) => (
                              <option key={entry.key} value={entry.key}>
                                {entry.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={`${cell} text-muted-foreground`}>
                          {itemsPerCategory[record.key] ?? 0}
                        </td>
                        <td className={`${cell} whitespace-nowrap text-center`}>
                          <button
                            type="button"
                            title="Save (Enter)"
                            onClick={() => saveCategoryEdit(record)}
                            disabled={saving}
                            className="mr-2 text-green-700 hover:text-green-900"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Cancel (Esc)"
                            onClick={cancelEditCategory}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  const used = itemsPerCategory[record.key] ?? 0;
                  return (
                    <tr key={record.id}>
                      <td className={`${cell} font-medium`}>{record.name}</td>
                      <td className={cell}>
                        <span className="rounded bg-muted px-2 py-0.5 text-xs">
                          {kindLabel(record.countsAs)}
                        </span>
                      </td>
                      <td className={`${cell} text-muted-foreground`}>{used}</td>
                      <td className={`${cell} whitespace-nowrap text-center`}>
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => startEditCategory(record)}
                          className="mr-3 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title={
                            used > 0
                              ? "Move its items to another category first"
                              : "Delete"
                          }
                          onClick={() => removeCategory(record)}
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
                onChange={(event) => setCategory(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {categoryOptions.map((entry) => (
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
            {CATEGORY_KINDS.find(
              (entry) =>
                entry.key ===
                (categories.find((item) => item.key === category)?.countsAs ??
                  "dry_cleaning")
            )?.hint}
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
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="all">All categories</option>
                {categoryOptions.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {records.length} item(s) in {categoryOptions.length} categories
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
                            setEditCategory(event.target.value)
                          }
                          className="h-8 w-full rounded border border-input bg-background px-1 text-sm"
                        >
                          {categoryOptions.map((entry) => (
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
                        {categoryLabel(record.category)}
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
