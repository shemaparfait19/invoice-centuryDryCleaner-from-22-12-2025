-- invoices.updated_at is bumped by a trigger on ANY update to the row —
-- including unrelated ones like a client-merge reassigning client_id.
-- "Recent Completed" was using updated_at as a stand-in for "when this
-- was marked completed", which made merged/edited-but-otherwise-untouched
-- invoices reappear as if freshly completed. This column is set only at
-- the moment status actually becomes "completed" (see updateInvoiceStatus
-- in lib/supabase-store.ts), so it can't drift the same way.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Best-effort backfill for invoices already completed before this column
-- existed — updated_at is the closest available guess for those, even
-- though (per the bug above) it may already be wrong for some of them.
UPDATE public.invoices
SET completed_at = updated_at
WHERE status = 'completed' AND completed_at IS NULL;
