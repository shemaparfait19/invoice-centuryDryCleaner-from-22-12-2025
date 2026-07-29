-- Adds per-item drop-off details: color of the garment, and how many
-- hangers/covers were brought in with it, so staff can reconcile items
-- at pickup instead of relying on memory.
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS hangers_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS covers_count INTEGER NOT NULL DEFAULT 0;
