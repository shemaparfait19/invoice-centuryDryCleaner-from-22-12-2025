-- Split / partial payments: an invoice can now have several payment
-- records instead of a single paid/unpaid flag, so a client can pay part
-- now (any method) and the rest later (same or different method).
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id VARCHAR(20) REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  method VARCHAR(50) NOT NULL,
  paid_by_name VARCHAR(255),
  paid_by_phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);

-- Backfill: every invoice already marked paid=true predates this table and
-- has no payment rows yet. Without this, they'd suddenly show as fully
-- unpaid (balance = total) the moment the app starts reading `payments`
-- instead of the old boolean.
--
-- invoices.paid_by_name/paid_by_phone only exist if
-- add-invoice-action-trackers.sql has been run — this branches so the
-- backfill works whether or not that migration was ever applied.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'paid_by_name'
  ) THEN
    INSERT INTO public.payments (invoice_id, amount, method, paid_by_name, paid_by_phone, created_at)
    SELECT i.id, i.total, i.payment_method, i.paid_by_name, i.paid_by_phone, i.updated_at
    FROM public.invoices i
    WHERE i.paid = true
      AND i.total > 0
      AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = i.id);
  ELSE
    INSERT INTO public.payments (invoice_id, amount, method, created_at)
    SELECT i.id, i.total, i.payment_method, i.updated_at
    FROM public.invoices i
    WHERE i.paid = true
      AND i.total > 0
      AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = i.id);
  END IF;
END $$;

-- Loyalty program: how many earned rewards (one per REWARD_MILESTONE
-- visits — see lib/loyalty.ts) the client has redeemed so far.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS rewards_redeemed INTEGER NOT NULL DEFAULT 0;
