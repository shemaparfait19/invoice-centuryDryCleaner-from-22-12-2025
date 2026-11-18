-- Product money collected later
-- Run this in the Supabase SQL editor after scripts/add-daily-cash-report.sql.
--
-- Products sold on credit (a hanger, a cover, detergent) are recorded in
-- extra_sales with amount_paid_cash / amount_paid_momo smaller than the price.
-- This table records each later collection, so the day it is paid shows on
-- page 2 of the daily report ("past invoices paid today") instead of being
-- silently lost or counted twice.
--
-- Nothing in this file rewrites or deletes an existing row.

CREATE TABLE IF NOT EXISTS public.extra_sale_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  extra_sale_id UUID NOT NULL REFERENCES public.extra_sales(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'MOMO')),
  account TEXT CHECK (account IS NULL OR account IN ('cleaner_phone', 'products_phone', 'cash')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extra_sale_payments_paid_at
  ON public.extra_sale_payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_extra_sale_payments_sale
  ON public.extra_sale_payments(extra_sale_id);

-- Same "allow all" pattern the other app tables use (the app gates access
-- with its own phone-code login and the manager /admin area).
ALTER TABLE public.extra_sale_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on extra_sale_payments" ON public.extra_sale_payments;
CREATE POLICY "Allow all on extra_sale_payments"
  ON public.extra_sale_payments FOR ALL USING (true);

GRANT ALL ON public.extra_sale_payments TO authenticated;
