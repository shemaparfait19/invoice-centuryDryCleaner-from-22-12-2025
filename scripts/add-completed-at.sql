-- invoices.updated_at is bumped by a trigger on ANY update to the row —
-- including unrelated ones like a client-merge reassigning client_id.
-- "Recent Completed" was using updated_at as a stand-in for "when this
-- was marked completed", which made merged/edited-but-otherwise-untouched
-- invoices reappear as if freshly completed. This column is set only at
-- the moment status actually becomes "completed" (see updateInvoiceStatus
-- in lib/supabase-store.ts), so it can't drift the same way.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill/repair for every completed invoice, in one unconditional pass —
-- always recomputes completed_at rather than only filling NULLs, because
-- an earlier flawed version of this script (fixed here) already wrote a
-- wrong non-null value from updated_at into every completed invoice, and
-- a NULL-only fallback would never touch those again. audit_logs is
-- append-only and never touched by the invoices trigger, so its record of
-- the status_update to "completed" is the trustworthy source where one
-- exists (an invoice transitioned to completed via the app); invoices
-- entered directly as "completed" (no such log) fall back to created_at —
-- never updated_at, which a client merge or any unrelated edit can bump.
UPDATE public.invoices i
SET completed_at = COALESCE(
  (
    SELECT a.created_at
    FROM public.audit_logs a
    WHERE a.entity_id = i.id
      AND a.action = 'status_update'
      AND a.changes->>'status' = 'completed'
    ORDER BY a.created_at DESC
    LIMIT 1
  ),
  i.created_at
)
WHERE i.status = 'completed';
