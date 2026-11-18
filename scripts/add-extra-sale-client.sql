-- Who bought a product / extra sale.
--
-- A NULL client_name means a walk-in customer. When the buyer is a known
-- client, client_id links the sale to their record and client_name keeps a
-- snapshot of the name as it was at the time of the sale.
--
-- The daily report never prints client names — this is only for the
-- /products page.

ALTER TABLE public.extra_sales
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_name TEXT;

CREATE INDEX IF NOT EXISTS idx_extra_sales_client_id
  ON public.extra_sales(client_id);
