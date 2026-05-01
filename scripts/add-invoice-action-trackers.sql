-- Tracks which employee marked an invoice as completed or paid
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS completed_by_name  TEXT,
  ADD COLUMN IF NOT EXISTS completed_by_phone TEXT,
  ADD COLUMN IF NOT EXISTS paid_by_name       TEXT,
  ADD COLUMN IF NOT EXISTS paid_by_phone      TEXT;
