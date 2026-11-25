"use client";

// Every clothes photo stored for invoices, newest first. This page exists so
// old photos can be deleted without opening each invoice — storage is the
// scarce resource, not the photos themselves (each is ~4 KB).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Images, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  deleteInvoicePhoto,
  deleteInvoicePhotos,
  invoicePhotoUrl,
  listAllInvoicePhotos,
  type InvoicePhotoWithInvoice,
} from "@/lib/invoice-photos";

interface PhotoGroup {
  invoiceId: string;
  clientName?: string;
  invoiceCreatedAt?: string;
  photos: InvoicePhotoWithInvoice[];
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PhotosPage() {
  const [photos, setPhotos] = useState<InvoicePhotoWithInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [confirmInvoiceId, setConfirmInvoiceId] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await listAllInvoicePhotos();
      setPhotos(all);
    } catch (err: any) {
      setError(err?.message || "Could not load photos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Photos arrive newest first, so the groups do too.
  const groups = useMemo<PhotoGroup[]>(() => {
    const byInvoice = new Map<string, PhotoGroup>();
    for (const photo of photos) {
      const existing = byInvoice.get(photo.invoiceId);
      if (existing) {
        existing.photos.push(photo);
      } else {
        byInvoice.set(photo.invoiceId, {
          invoiceId: photo.invoiceId,
          clientName: photo.invoiceClientName,
          invoiceCreatedAt: photo.invoiceCreatedAt,
          photos: [photo],
        });
      }
    }
    return Array.from(byInvoice.values());
  }, [photos]);

  const groupToDelete = confirmInvoiceId
    ? groups.find((group) => group.invoiceId === confirmInvoiceId)
    : undefined;

  const totalBytes = photos.reduce((sum, photo) => sum + (photo.bytes || 0), 0);

  const handleDelete = async (photo: InvoicePhotoWithInvoice) => {
    setDeletingIds((prev) => [...prev, photo.id]);
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
      setDeletingIds((prev) => prev.filter((id) => id !== photo.id));
    }
  };

  const handleDeleteGroup = async (groupPhotos: InvoicePhotoWithInvoice[]) => {
    setDeletingGroup(true);
    try {
      await deleteInvoicePhotos(groupPhotos);
      const removed = new Set(groupPhotos.map((photo) => photo.id));
      setPhotos((prev) => prev.filter((photo) => !removed.has(photo.id)));
      toast({
        title: `Removed ${groupPhotos.length} photo${
          groupPhotos.length === 1 ? "" : "s"
        }`,
      });
    } catch (err: any) {
      toast({
        title: "Could not remove photos",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingGroup(false);
      setConfirmInvoiceId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 pt-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      <div className="container mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Images className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Clothes photos</h1>
            <p className="text-sm text-muted-foreground">
              Every photo saved on an invoice. Delete the ones you no longer
              need to free storage.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      <div className="container mx-auto space-y-4 px-4 pb-10">
        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">Photos stored</p>
              <p className="text-3xl font-bold">
                {loading && photos.length === 0 ? "—" : photos.length}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatSize(totalBytes)} total in the invoice-photos bucket
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Could not load photos.</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {loading && photos.length === 0 ? (
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
          </p>
        ) : photos.length === 0 ? (
          !error && (
            <div className="rounded-lg border py-16 text-center text-muted-foreground">
              No photos stored yet.
            </div>
          )
        ) : (
          groups.map((group) => {
            const groupBytes = group.photos.reduce(
              (sum, photo) => sum + (photo.bytes || 0),
              0
            );
            return (
              <div key={group.invoiceId} className="rounded-lg border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {group.clientName || "Unknown client"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{group.invoiceId}</span>
                      {group.invoiceCreatedAt && (
                        <>
                          {" · "}
                          {new Date(
                            group.invoiceCreatedAt
                          ).toLocaleDateString()}
                        </>
                      )}
                      {" · "}
                      {group.photos.length} photo
                      {group.photos.length === 1 ? "" : "s"} ·{" "}
                      {formatSize(groupBytes)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmInvoiceId(group.invoiceId)}
                    disabled={deletingGroup}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete all
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-6">
                  {group.photos.map((photo) => {
                    const url = invoicePhotoUrl(photo.storagePath);
                    const deleting = deletingIds.includes(photo.id);
                    return (
                      <div
                        key={photo.id}
                        className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={
                            photo.itemLabel
                              ? `Photo of ${photo.itemLabel}`
                              : `Photo on invoice ${photo.invoiceId}`
                          }
                          loading="lazy"
                          onClick={() =>
                            window.open(url, "_blank", "noopener,noreferrer")
                          }
                          className="h-full w-full cursor-zoom-in object-cover"
                        />
                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                          {formatSize(photo.bytes)}
                        </span>
                        {photo.itemLabel && (
                          <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                            {photo.itemLabel}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(photo)}
                          disabled={deleting}
                          title="Delete photo"
                          aria-label="Delete photo"
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-red-600 disabled:opacity-70"
                        >
                          {deleting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AlertDialog
        open={Boolean(groupToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingGroup) setConfirmInvoiceId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete all photos on this invoice?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {groupToDelete
                ? `${groupToDelete.photos.length} photo${
                    groupToDelete.photos.length === 1 ? "" : "s"
                  } for ${
                    groupToDelete.clientName || groupToDelete.invoiceId
                  } will be permanently removed from storage. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingGroup}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                groupToDelete && handleDeleteGroup(groupToDelete.photos)
              }
              disabled={deletingGroup}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingGroup ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
