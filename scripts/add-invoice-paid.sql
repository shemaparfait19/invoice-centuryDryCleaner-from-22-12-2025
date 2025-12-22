-- Adds a paid flag to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_invoices_paid ON public.invoices(paid);

