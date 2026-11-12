-- Daily Cash Report support
-- Run this in the Supabase SQL editor before using /daily-report.
--
-- 1. payments.account / payments.status
--    Existing payment rows keep their amount, method, date and author. They
--    simply get account = NULL (meaning "use the report's default rule") and
--    status = 'confirmed' (they were already treated as received money).
-- 2. daily_balances  — the opening balances typed in by the manager each day.
-- 3. withdrawals     — money the owner takes out of a phone or the cash box.
-- 4. extra_sales     — detergents / hangers / covers / hand wash sold outside
--    the dry-cleaning invoice flow (they are not in lib/services.ts).
--
-- Nothing in this file rewrites or deletes an existing invoice or payment.

-- ---------------------------------------------------------------------------
-- payments: which account received the money, and whether MoMo is confirmed
-- ---------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS account TEXT;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_account_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_account_check
      CHECK (account IS NULL OR account IN ('cleaner_phone', 'products_phone', 'cash'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_status_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_status_check
      CHECK (status IN ('confirmed', 'pending'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_account ON public.payments(account);

-- ---------------------------------------------------------------------------
-- daily_balances: one row per report date
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  opening_cleaner_phone DECIMAL(12, 2) NOT NULL DEFAULT 0,
  opening_products_phone DECIMAL(12, 2) NOT NULL DEFAULT 0,
  opening_cash DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_daily_balances_updated_at ON public.daily_balances;
CREATE TRIGGER update_daily_balances_updated_at
  BEFORE UPDATE ON public.daily_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- withdrawals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  withdrawn_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  account TEXT NOT NULL CHECK (account IN ('cleaner_phone', 'products_phone', 'cash')),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_withdrawn_at ON public.withdrawals(withdrawn_at);

-- ---------------------------------------------------------------------------
-- extra_sales: products and extras sold outside an invoice
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.extra_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category TEXT NOT NULL CHECK (category IN ('product', 'extra')),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_price DECIMAL(12, 2) NOT NULL CHECK (total_price >= 0),
  amount_paid_cash DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid_cash >= 0),
  amount_paid_momo DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid_momo >= 0),
  account TEXT CHECK (account IS NULL OR account IN ('cleaner_phone', 'products_phone', 'cash')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extra_sales_sold_at ON public.extra_sales(sold_at);

-- ---------------------------------------------------------------------------
-- RLS: same "allow all" pattern already used by clients / invoices /
-- invoice_items / payments / audit_logs in this app (the app gates access
-- with its own phone-code login and the manager /admin area).
-- ---------------------------------------------------------------------------
ALTER TABLE public.daily_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extra_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on daily_balances" ON public.daily_balances;
DROP POLICY IF EXISTS "Allow all on withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "Allow all on extra_sales" ON public.extra_sales;

CREATE POLICY "Allow all on daily_balances" ON public.daily_balances FOR ALL USING (true);
CREATE POLICY "Allow all on withdrawals" ON public.withdrawals FOR ALL USING (true);
CREATE POLICY "Allow all on extra_sales" ON public.extra_sales FOR ALL USING (true);

GRANT ALL ON public.daily_balances TO authenticated;
GRANT ALL ON public.withdrawals TO authenticated;
GRANT ALL ON public.extra_sales TO authenticated;
