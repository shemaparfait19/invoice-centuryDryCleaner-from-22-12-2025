-- One-time correction: the original add-payments-and-loyalty.sql backfill
-- stamped each historical payment's created_at with the invoice's
-- updated_at — which a DB trigger bumps on ANY update to the invoice row
-- (e.g. the Duplicate Clients merge tool reassigning client_id). Any
-- invoice merged (or otherwise bulk-edited) between running that backfill
-- and now got its backfilled payment mis-dated to that merge/edit moment,
-- making old paid invoices reappear at the top of "Recent Paid".
--
-- This only touches payments whose created_at exactly matches their
-- invoice's updated_at — the precise signature the flawed backfill
-- produced — so genuinely-recorded payments (via Record Payment in the
-- app) are never touched. Re-dates them to the invoice's created_at,
-- consistent with the corrected backfill logic.
UPDATE public.payments p
SET created_at = i.created_at
FROM public.invoices i
WHERE p.invoice_id = i.id
  AND p.created_at = i.updated_at
  AND p.created_at IS DISTINCT FROM i.created_at;
