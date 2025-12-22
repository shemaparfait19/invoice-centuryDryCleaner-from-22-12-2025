-- Adds creator metadata to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS created_by_phone TEXT;

-- Optional index if you plan to filter by creator
CREATE INDEX IF NOT EXISTS idx_invoices_created_by_phone ON public.invoices(created_by_phone);

