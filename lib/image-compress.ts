"use client";

// Downscale + re-encode phone photos before upload. A modern phone camera
// shot is 3-12 MB; the raw camera file must never reach storage.
//
// Photos here are staff reference shots ("what did this client drop off"),
// not print-quality images, so they are squeezed hard: the encoder walks a
// ladder of smaller sizes and lower JPEG qualities until the file fits
// MAX_BYTES. If a browser cannot hit the cap even at the smallest step, the
// smallest result is used rather than the original.
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

// Hard ceiling for one uploaded photo (bytes). 4 KB keeps even hundreds of
// invoices negligible in Supabase storage. Raise this single number if the
// photos ever need to be sharper.
export const MAX_UPLOAD_BYTES = 4 * 1024;

// Largest edge tried first, then progressively smaller.
const EDGE_LADDER = [
  1400, 1100, 900, 720, 560, 440, 360, 300, 256, 220, 192, 160, 128,
];

// Quality tried at each size, sharpest first.
const QUALITY_LADDER = [0.72, 0.6, 0.5, 0.42, 0.35, 0.28, 0.22, 0.16];

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

function encode(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not compress photo")),
      "image/jpeg",
      quality
    );
  });
}

export async function compressImage(file: Blob): Promise<CompressedImage> {
  const source = await loadBitmap(file);
  if (!source.width || !source.height) {
    throw new Error("This image has no readable size");
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process photos");

  let best: CompressedImage | null = null;

  for (const edge of EDGE_LADDER) {
    const scale = Math.min(1, edge / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    // A size we have already passed (source smaller than this step) would
    // only repeat the previous attempt.
    if (best && width === best.width && height === best.height) continue;

    canvas.width = width;
    canvas.height = height;
    // White backing so transparent PNGs don't turn black in JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    source.draw(ctx, width, height);

    for (const quality of QUALITY_LADDER) {
      const blob = await encode(canvas, quality);
      const result: CompressedImage = { blob, width, height, bytes: blob.size };
      if (!best || blob.size < best.bytes) best = result;
      if (blob.size <= MAX_UPLOAD_BYTES) return result;
    }
  }

  // Could not reach the cap (very unusual); the smallest attempt is still
  // far better than uploading the original camera file.
  if (!best) throw new Error("Could not compress photo");
  return best;
}
