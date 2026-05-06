"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { SERVICES } from "@/lib/services";
import { useSupabaseStore } from "@/lib/supabase-store";
import { formatCurrency, generateInvoiceId } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { Client, Invoice, InvoiceItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const phoneSchema = z
  .string()
  .min(1, "Phone number is required")
  .regex(
    /^\+?[1-9]\d{7,14}$/,
    "Phone must be international format, e.g. +14155552671"
  );

const invoiceSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  clientPhone: phoneSchema,
  clientAddress: z.string().optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(1, "Description is required"),
        quantity: z.number().min(1, "Quantity must be at least 1"),
        unitPrice: z.number().min(0, "Unit price must be positive"),
      })
    )
    .min(1, "At least one item is required"),
  paymentMethod: z.string().min(1, "Payment method is required"),
  // Creation date, defaults to today but user can customize
  createdDate: z.string().min(1, "Invoice date is required"),
  pickupDate: z.string().optional(),
  pickupTime: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["pending", "completed", "cancelled"]),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  editingId?: string | null;
  onSave: () => void;
  onCancel: () => void;
}

export function InvoiceForm({ editingId, onSave, onCancel }: InvoiceFormProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const clientInputRef = useRef<HTMLInputElement | null>(null);
  const { invoices, clients, addInvoice, updateInvoice, addClient, loading } =
    useSupabaseStore();

  const editingInvoice = editingId
    ? invoices.find((inv) => inv.id === editingId)
    : null;

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      clientName: "",
      clientPhone: "",
      clientAddress: "",
      items: [{ description: "", quantity: 1, unitPrice: 0 }],
      paymentMethod: "",
      createdDate: new Date().toISOString().slice(0, 10),
      pickupDate: "",
      pickupTime: "",
      notes: "",
      status: "pending",
    },
    mode: "onChange", // Add this for better validation feedback
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  useEffect(() => {
    if (editingInvoice) {
      form.reset({
        clientName: editingInvoice.client.name,
        clientPhone: editingInvoice.client.phone,
        clientAddress: editingInvoice.client.address || "",
        items: editingInvoice.items,
        paymentMethod: editingInvoice.paymentMethod,
        createdDate: (
          editingInvoice.createdAt || new Date().toISOString()
        ).slice(0, 10),
        pickupDate: editingInvoice.pickupDate || "",
        pickupTime: editingInvoice.pickupTime || "",
        notes: editingInvoice.notes || "",
        status: editingInvoice.status,
      });
    }
  }, [editingInvoice, form]);

  const clientNameValue = form.watch("clientName") || "";

  const clientSuggestions = clientNameValue.trim().length > 0
    ? clients
        .filter(
          (c) =>
            c.name.toLowerCase().includes(clientNameValue.toLowerCase()) ||
            c.phone.includes(clientNameValue)
        )
        .slice(0, 8)
    : [];

  const selectClient = (client: Client) => {
    form.setValue("clientName", client.name, { shouldValidate: true });
    form.setValue("clientPhone", client.phone, { shouldValidate: true });
    form.setValue("clientAddress", client.address || "");
    setShowSuggestions(false);
  };

  const calculateTotal = () => {
    const items = form.watch("items");
    return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  };

  const onSubmit = async (data: InvoiceFormData) => {
    try {
      console.log("Form submission started with data:", data);

      // Validate required fields
      if (!data.clientName.trim()) {
        toast({ title: "Client name is required", variant: "destructive" });
        return;
      }

      if (!data.clientPhone.trim()) {
        toast({ title: "Client phone is required", variant: "destructive" });
        return;
      }

      if (!data.paymentMethod) {
        toast({ title: "Payment method is required", variant: "destructive" });
        return;
      }

      if (data.items.length === 0) {
        toast({
          title: "At least one item is required",
          variant: "destructive",
        });
        return;
      }

      // Validate items
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        if (!item.description.trim()) {
          toast({
            title: `Item ${i + 1} description is required`,
            variant: "destructive",
          });
          return;
        }
        if (item.quantity <= 0) {
          toast({
            title: `Item ${i + 1} quantity must be greater than 0`,
            variant: "destructive",
          });
          return;
        }
        if (item.unitPrice < 0) {
          toast({
            title: `Item ${i + 1} unit price cannot be negative`,
            variant: "destructive",
          });
          return;
        }
      }

      // Find or create client
      let client = clients.find((c) => c.phone === data.clientPhone);
      if (!client) {
        console.log("Creating new client...");
        const newClient = await addClient({
          name: data.clientName,
          phone: data.clientPhone,
          address: data.clientAddress || "",
          visitCount: 0,
          rewardClaimed: false,
          lastVisit: new Date().toISOString(),
        });
        if (!newClient) {
          toast({ title: "Failed to create client", variant: "destructive" });
          return;
        }
        client = newClient;
      }

      const total = calculateTotal();
      console.log("Calculated total:", total);

      // Build createdAt by combining selected date with current local time
      const buildCreatedAt = (dateOnly: string) => {
        const now = new Date();
        const [y, m, d] = dateOnly.split("-").map((v) => parseInt(v, 10));
        const local = new Date(
          y,
          (m || 1) - 1,
          d || 1,
          now.getHours(),
          now.getMinutes(),
          now.getSeconds(),
          now.getMilliseconds()
        );
        return local.toISOString();
      };

      const createdAtIso = buildCreatedAt(data.createdDate);

      const invoiceData: Omit<Invoice, "createdAt" | "updatedAt"> = {
        id: editingId || generateInvoiceId(),
        client,
        items: data.items.map((item) => ({
          id: crypto.randomUUID(),
          ...item,
          totalPrice: item.quantity * item.unitPrice,
        })),
        total,
        paymentMethod: data.paymentMethod,
        status: data.status,
        pickupDate: data.pickupDate || undefined,
        pickupTime: data.pickupTime || undefined,
        notes: data.notes || undefined,
      };

      console.log("Invoice data prepared:", invoiceData);

      if (editingId) {
        console.log("Updating existing invoice...");
        await updateInvoice(editingId, {
          ...invoiceData,
          createdAt: createdAtIso,
        });
        toast({ title: "Invoice updated successfully!" });
      } else {
        console.log("Creating new invoice...");
        await addInvoice({
          ...invoiceData,
          // Pass optional createdAt to override DB default when user customizes
          createdAt: createdAtIso,
        } as any);
        toast({ title: "Invoice created successfully!" });
      }

      console.log("Invoice operation completed, calling onSave...");
      onSave();
    } catch (error: any) {
      console.error("Error in form submission:", error);
      toast({
        title: "Error saving invoice",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <h1 className="text-xl sm:text-2xl font-bold">
          {editingId ? "Edit Invoice" : "Create New Invoice"}
        </h1>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading}
            onClick={form.handleSubmit(onSubmit)}
            className="w-full sm:w-auto"
          >
            {loading ? "Saving..." : editingId ? "Update" : "Create"} Invoice
          </Button>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Client Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Label htmlFor="clientName">Client Name</Label>
              <Input
                id="clientName"
                {...form.register("clientName")}
                ref={(el) => {
                  form.register("clientName").ref(el);
                  clientInputRef.current = el;
                }}
                placeholder="Type a name or phone to find existing client…"
                autoComplete="off"
                onChange={(e) => {
                  form.setValue("clientName", e.target.value, { shouldValidate: true });
                  setShowSuggestions(e.target.value.trim().length > 0);
                }}
                onFocus={() => {
                  if (clientNameValue.trim().length > 0) setShowSuggestions(true);
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              />
              {form.formState.errors.clientName && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.clientName.message}
                </p>
              )}

              {showSuggestions && clientSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg overflow-hidden">
                  <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Existing clients
                  </p>
                  <ul className="max-h-48 overflow-y-auto divide-y">
                    {clientSuggestions.map((client) => (
                      <li
                        key={client.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectClient(client)}
                        className="flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 cursor-pointer transition-colors"
                      >
                        <span className="font-medium text-sm">{client.name}</span>
                        <span className="text-xs text-muted-foreground ml-4">{client.phone}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="px-3 py-2 text-xs text-muted-foreground border-t bg-gray-50">
                    Not listed? Keep typing to create a new client.
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="clientPhone">Phone Number</Label>
              <Input
                id="clientPhone"
                {...form.register("clientPhone")}
                placeholder="+250XXXXXXXXX"
              />
              {form.formState.errors.clientPhone && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.clientPhone.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="clientAddress">Address (Optional)</Label>
              <Textarea
                id="clientAddress"
                {...form.register("clientAddress")}
                placeholder="Enter client address"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
              <CardTitle className="text-lg">Invoice Items</CardTitle>
              <Button
                type="button"
                onClick={() =>
                  append({ description: "", quantity: 1, unitPrice: 0 })
                }
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid grid-cols-1 gap-4 p-4 border rounded"
              >
                <div>
                  <Label>Description</Label>
                  <div className="relative">
                    <Input
                      {...form.register(`items.${index}.description`)}
                      placeholder="Start typing a service..."
                      onChange={(e) => {
                        form.setValue(
                          `items.${index}.description`,
                          e.target.value
                        );
                      }}
                    />
                    {form.watch(`items.${index}.description`) && (
                      <div className="absolute z-10 mt-1 w-full max-h-40 overflow-auto rounded border bg-white shadow">
                        {SERVICES.filter((s) =>
                          s
                            .toLowerCase()
                            .includes(
                              (
                                form.watch(`items.${index}.description`) || ""
                              ).toLowerCase()
                            )
                        )
                          .slice(0, 8)
                          .map((s) => (
                            <button
                              type="button"
                              key={s}
                              className="w-full text-left px-3 py-2 hover:bg-muted"
                              onClick={() =>
                                form.setValue(`items.${index}.description`, s)
                              }
                            >
                              {s}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      {...form.register(`items.${index}.quantity`, {
                        valueAsNumber: true,
                      })}
                      min="1"
                    />
                  </div>
                  <div>
                    <Label>Unit Price (RWF)</Label>
                    <Input
                      type="number"
                      {...form.register(`items.${index}.unitPrice`, {
                        valueAsNumber: true,
                      })}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                    className="w-full sm:w-auto"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}

            <div className="text-right">
              <p className="text-lg font-semibold">
                Total: {formatCurrency(calculateTotal())}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Payment & Delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="createdDate">Invoice Date</Label>
              <Input
                id="createdDate"
                type="date"
                {...form.register("createdDate")}
              />
              {form.formState.errors.createdDate && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.createdDate.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select
                value={form.watch("paymentMethod")}
                onValueChange={(value) => form.setValue("paymentMethod", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNPAID">Unpaid / On Account</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="MOMO">Mobile Money</SelectItem>
                  <SelectItem value="BANK">Bank Transfer</SelectItem>
                  <SelectItem value="CARD">Card Payment</SelectItem>
                </SelectContent>
              </Select>

              {/* Auto-suggest paid flag based on payment method */}
              {form.watch("paymentMethod") === "UNPAID" && (
                <p className="text-xs text-yellow-700 mt-1">
                  This invoice will be marked as unpaid.
                </p>
              )}

              {form.formState.errors.paymentMethod && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.paymentMethod.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pickupDate">Pickup Date (Optional)</Label>
                <Input
                  id="pickupDate"
                  type="date"
                  {...form.register("pickupDate")}
                />
              </div>
              <div>
                <Label htmlFor="pickupTime">Pickup Time (Optional)</Label>
                <Input
                  id="pickupTime"
                  type="time"
                  {...form.register("pickupTime")}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(value) => form.setValue("status", value as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              {form.formState.errors.status && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.status.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="notes" className="flex items-center gap-2">
                <span>Notes & Instructions</span>
                {form.watch("notes") && (
                  <Badge variant="secondary" className="text-xs">
                    Has Notes
                  </Badge>
                )}
              </Label>
              <Textarea
                id="notes"
                {...form.register("notes")}
                placeholder="Add special instructions, delivery notes, or any important information for this invoice..."
                rows={3}
                className="min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use this field to add special instructions, delivery notes, or
                any important information that staff should know.
              </p>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
