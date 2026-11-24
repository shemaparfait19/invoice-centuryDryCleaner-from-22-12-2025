"use client";

import { supabase } from "./supabase";
import type { InvoicePhoto } from "./types";

export const INVOICE_PHOTOS_BUCKET = "invoice-photos";

// Keep each gallery small. Compression already makes photos cheap; the cap
// is only to stop an accidental burst of uploads.
export const MAX_PHOTOS_PER_GROUP = 8;

interface InvoicePhotoRow {
  id: string;
  invoice_id: string;
  item_label: string | null;
  storage_path: string;
  bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

function toPhoto(row: InvoicePhotoRow): InvoicePhoto {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    itemLabel: row.item_label ?? undefined,
    storagePath: row.storage_path,
    bytes: row.bytes,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    createdAt: row.created_at,
  };
}

// Missing table/bucket just means the setup SQL hasn't been run yet; say so
// plainly instead of showing a raw Postgres/Storage error.
function setupHint(error: { message?: string; code?: string }, action?: string): string {
  const message = error?.message || "Photo storage is not available";
  const missing =
    error?.code === "42P01" ||
    /does not exist|could not find|not found|bucket not found/i.test(message);
  if (missing) {
    return `${message}. Run scripts/add-invoice-photos.sql in the Supabase SQL editor, then try again.`;
  }
  return action === "upload" ? `Could not upload photo: ${message}` : message;
}

export function invoicePhotoUrl(storagePath: string): string {
  return supabase.storage
    .from(INVOICE_PHOTOS_BUCKET)
    .getPublicUrl(storagePath).data.publicUrl;
}

export async function listInvoicePhotos(
  invoiceId: string
): Promise<InvoicePhoto[]> {
  const { data, error } = await supabase
    .from("invoice_photos")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(setupHint(error));
  return ((data || []) as InvoicePhotoRow[]).map(toPhoto);
}

export async function uploadInvoicePhoto(
  invoiceId: string,
  blob: Blob,
  itemLabel: string | null,
  size?: { width?: number; height?: number }
): Promise<InvoicePhoto> {
  const path = `${invoiceId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(INVOICE_PHOTOS_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });

  if (uploadError) {
    throw new Error(setupHint(uploadError, "upload"));
  }

  const { data, error } = await supabase
    .from("invoice_photos")
    .insert({
      invoice_id: invoiceId,
      item_label: itemLabel,
      storage_path: path,
      bytes: blob.size,
      width: size?.width ?? null,
      height: size?.height ?? null,
    })
    .select()
    .single();

  if (error) {
    // Don't leave an orphaned file behind if the row failed.
    await supabase.storage.from(INVOICE_PHOTOS_BUCKET).remove([path]);
    throw new Error(setupHint(error));
  }

  return toPhoto(data as InvoicePhotoRow);
}

export async function deleteInvoicePhoto(photo: InvoicePhoto): Promise<void> {
  const { error } = await supabase
    .from("invoice_photos")
    .delete()
    .eq("id", photo.id);
  if (error) throw new Error(error.message);

  await supabase.storage
    .from(INVOICE_PHOTOS_BUCKET)
    .remove([photo.storagePath]);
}
