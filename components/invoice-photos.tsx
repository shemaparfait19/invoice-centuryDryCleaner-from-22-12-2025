"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Maximize2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/image-compress";
import {
  MAX_PHOTOS_PER_GROUP,
  deleteInvoicePhoto,
  invoicePhotoUrl,
  listInvoicePhotos,
  uploadInvoicePhoto,
} from "@/lib/invoice-photos";
import type { InvoicePhoto } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared picker buttons (camera on phones, file picker everywhere)
// ---------------------------------------------------------------------------

interface PhotoPickerButtonsProps {
  onFiles: (files: FileList | File[]) => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
}

export function PhotoPickerButtons({
  onFiles,
  disabled,
  busy,
  compact,
}: PhotoPickerButtonsProps) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || busy}
        onClick={() => cameraRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Camera className="h-4 w-4 mr-2" />
        )}
        {compact ? "Camera" : "Take Photo"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || busy}
        onClick={() => uploadRef.current?.click()}
      >
        <ImagePlus className="h-4 w-4 mr-2" />
        Upload
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photos already saved against an invoice
// ---------------------------------------------------------------------------

interface InvoicePhotosProps {
  invoiceId: string;
  // undefined = show every photo on the invoice (used in the preview).
  // null = only whole-order photos. A string = only that item's photos.
  itemLabel?: string | null;
  title?: string;
  description?: string;
  compact?: boolean;
  readOnly?: boolean;
}

export function InvoicePhotos({
  invoiceId,
  itemLabel,
  title = "Clothes Photos",
  description = "Optional — take or upload a photo so you can remember exactly what was dropped off.",
  compact,
  readOnly,
}: InvoicePhotosProps) {
  const [photos, setPhotos] = useState<InvoicePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<InvoicePhoto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listInvoicePhotos(invoiceId);
      setPhotos(all);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Could not load photos");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  // Full-screen photo viewing: Esc closes it, and the page behind doesn't
  // scroll while it's open.
  useEffect(() => {
    if (!viewing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewing(null);
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [viewing]);

  const visible =
    itemLabel === undefined
      ? photos
      : photos.filter((p) => (p.itemLabel || null) === (itemLabel || null));

  const atLimit = visible.length >= MAX_PHOTOS_PER_GROUP;

  const handleFiles = async (files: FileList | File[]) => {
    if (atLimit) {
      toast({
        title: `Photo limit reached`,
        description: `This section already has ${MAX_PHOTOS_PER_GROUP} photos. Remove one to add another.`,
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    let added = 0;
    for (const file of Array.from(files)) {
      if (visible.length + added >= MAX_PHOTOS_PER_GROUP) break;
      try {
        const image = await compressImage(file);
        const photo = await uploadInvoicePhoto(
          invoiceId,
          image.blob,
          itemLabel === undefined ? null : itemLabel,
          { width: image.width, height: image.height }
        );
        setPhotos((prev) => [...prev, photo]);
        added++;
      } catch (err: any) {
        toast({
          title: "Photo not saved",
          description: err?.message || "Please try again.",
          variant: "destructive",
        });
        break;
      }
    }
    setBusy(false);
  };

  const handleDelete = async (photo: InvoicePhoto) => {
    setBusy(true);
    try {
      await deleteInvoicePhoto(photo);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      toast({ title: "Photo removed" });
    } catch (err: any) {
      toast({
        title: "Could not remove photo",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const totalBytes = visible.reduce((sum, p) => sum + (p.bytes || 0), 0);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={compact ? "text-sm font-medium" : "font-medium"}>
            {title}
            {!loading && visible.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {visible.length} photo{visible.length === 1 ? "" : "s"} ·{" "}
                {formatPhotoSize(totalBytes)}
              </span>
            )}
          </p>
          {!compact && description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {!readOnly && (
          <PhotoPickerButtons
            onFiles={handleFiles}
            busy={busy}
            disabled={atLimit || loading}
            compact={compact}
          />
        )}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading photos…
        </p>
      ) : error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : visible.length === 0 ? (
        !compact && (
          <p className="text-xs text-muted-foreground">
            No photos yet. Photos are compressed automatically to save storage.
          </p>
        )
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {visible.map((photo) => (
            <div
              key={photo.id}
              className="relative group aspect-square overflow-hidden rounded-md border bg-muted"
            >
              {/* Plain <img>: Supabase storage is already unoptimized and
                  next/image would need remote-pattern config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={invoicePhotoUrl(photo.storagePath)}
                alt={photo.itemLabel ? `Photo of ${photo.itemLabel}` : "Photo of this order"}
                loading="lazy"
                className="h-full w-full object-cover cursor-zoom-in"
                onClick={() => setViewing(photo)}
              />
              <button
                type="button"
                onClick={() => setViewing(photo)}
                title="View full screen"
                aria-label="View photo full screen"
                className="absolute bottom-1 left-1 rounded bg-black/60 p-1 text-white hover:bg-black/80"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
              {photo.itemLabel && itemLabel === undefined && (
                <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  {photo.itemLabel}
                </span>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleDelete(photo)}
                  disabled={busy}
                  title="Remove photo"
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-90 hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={viewing.itemLabel ? `Photo of ${viewing.itemLabel}` : "Invoice photo"}
          className="fixed inset-0 z-[100] flex flex-col bg-black"
          onClick={() => setViewing(null)}
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2 text-white">
            <p className="min-w-0 truncate text-sm">
              {viewing.itemLabel || "Whole order"}
            </p>
            <button
              type="button"
              onClick={() => setViewing(null)}
              aria-label="Close photo"
              className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={invoicePhotoUrl(viewing.storagePath)}
              alt={viewing.itemLabel ? `Photo of ${viewing.itemLabel}` : "Invoice photo"}
              onClick={(event) => event.stopPropagation()}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <p className="pb-4 pt-2 text-center text-xs text-white/60">
            Tap outside the photo or press Esc to close
          </p>
        </div>
      )}
    </div>
  );
}

// A saved invoice's photos grouped the way staff think about them: one
// section for the whole order, then one section per invoice line. Each
// section has its own Camera/Upload buttons and 8-photo allowance.
interface InvoicePhotosWithItemsProps {
  invoiceId: string;
  items: { id: string; description: string }[];
  readOnly?: boolean;
}

export function InvoicePhotosWithItems({
  invoiceId,
  items,
  readOnly,
}: InvoicePhotosWithItemsProps) {
  const labelled = items.filter((item) => item.description.trim().length > 0);
  return (
    <div className="space-y-4">
      <InvoicePhotos
        invoiceId={invoiceId}
        itemLabel={null}
        title="All clothes together"
        description="One or more photos of the whole order. Useful for shoes or items that are hard to name."
        readOnly={readOnly}
      />
      {labelled.map((item) => (
        <div key={item.id} className="border-t pt-3">
          <InvoicePhotos
            invoiceId={invoiceId}
            itemLabel={item.description.trim()}
            title={item.description}
            compact
            readOnly={readOnly}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photos chosen before a new invoice exists yet — held in memory, uploaded
// right after the invoice is saved.
// ---------------------------------------------------------------------------

export interface PendingPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
  itemIndex: number | null;
  bytes: number;
}

export function usePendingPhotos() {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const photosRef = useRef<PendingPhoto[]>([]);
  photosRef.current = photos;

  // Object URLs are only valid until revoked; clean them up on unmount.
  useEffect(() => {
    return () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  const add = async (files: FileList | File[], itemIndex: number | null) => {
    const current = photosRef.current.filter((p) => p.itemIndex === itemIndex);
    if (current.length >= MAX_PHOTOS_PER_GROUP) {
      toast({
        title: "Photo limit reached",
        description: `You can attach up to ${MAX_PHOTOS_PER_GROUP} photos here.`,
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    let added = 0;
    for (const file of Array.from(files)) {
      if (current.length + added >= MAX_PHOTOS_PER_GROUP) break;
      try {
        const image = await compressImage(file);
        const pending: PendingPhoto = {
          id: crypto.randomUUID(),
          blob: image.blob,
          previewUrl: URL.createObjectURL(image.blob),
          itemIndex,
          bytes: image.bytes,
        };
        setPhotos((prev) => [...prev, pending]);
        added++;
      } catch (err: any) {
        toast({
          title: "Could not use that photo",
          description: err?.message || "Please try another image.",
          variant: "destructive",
        });
        break;
      }
    }
    setBusy(false);
  };

  const remove = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  // Drops a deleted item row's photos and keeps the following rows pointing
  // at the correct item index after the array shrinks.
  const removeForItem = (itemIndex: number) => {
    setPhotos((prev) => {
      prev
        .filter((p) => p.itemIndex === itemIndex)
        .forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return prev
        .filter((p) => p.itemIndex !== itemIndex)
        .map((p) =>
          p.itemIndex !== null && p.itemIndex > itemIndex
            ? { ...p, itemIndex: p.itemIndex - 1 }
            : p
        );
    });
  };

  const clear = () => {
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
  };

  return { photos, add, remove, removeForItem, clear, busy };
}

interface PendingPhotoGridProps {
  photos: PendingPhoto[];
  onRemove: (id: string) => void;
}

export function PendingPhotoGrid({ photos, onRemove }: PendingPhotoGridProps) {
  if (photos.length === 0) return null;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {photos.map((photo) => (
        <div
          key={photo.id}
          className="relative aspect-square overflow-hidden rounded-md border bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.previewUrl}
            alt="Selected photo"
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(photo.id)}
            title="Remove photo"
            aria-label="Remove photo"
            className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-red-600"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <p className="col-span-full text-[11px] text-muted-foreground">
        Photos will be saved when you create the invoice.
      </p>
    </div>
  );
}

function formatPhotoSize(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
