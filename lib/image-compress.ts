"use client";

// Downscale + re-encode phone photos before upload. A modern phone camera
// shot is 3-8 MB; this brings it to roughly 80-200 KB, which keeps the
// Supabase storage and the monthly egress small even with many invoices.
//
// Phone photos are also orientation-tagged. `createImageBitmap` with
// imageOrientation: "from-image" applies that tag so portrait shots don't
// come out sideways.

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}

const LONG_EDGE = 1400;

async function loadBitmap(file: Blob): Promise<{
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  width: number;
  height: number;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      };
    } catch {
      // Fall through to <img> decoding (older Safari, some HEIC files).
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read this image"));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file: Blob): Promise<CompressedImage> {
  const source = await loadBitmap(file);
  if (!source.width || !source.height) {
    throw new Error("This image has no readable size");
  }

  const scale = Math.min(1, LONG_EDGE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process photos");

  // White backing so transparent PNGs don't turn black in JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  source.draw(ctx, width, height);

  const encode = (quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Could not compress photo")),
        "image/jpeg",
        quality
      );
    });

  // Start sharp enough to still recognise shoes/patterns, then step down
  // only if the result is still big.
  let blob = await encode(0.72);
  if (blob.size > 260 * 1024) blob = await encode(0.6);
  if (blob.size > 320 * 1024) blob = await encode(0.48);

  return { blob, width, height, bytes: blob.size };
}
