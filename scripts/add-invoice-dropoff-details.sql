-- Records whether the client brought hangers/covers with their drop-off,
-- and how many, so staff never have to rely on memory at pickup time.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS hangers_brought BOOLEAN,
  ADD COLUMN IF NOT EXISTS hangers_count INTEGER,
  ADD COLUMN IF NOT EXISTS covers_brought BOOLEAN,
  ADD COLUMN IF NOT EXISTS covers_count INTEGER;
