-- The shop's own item list, edited from /items.
--
-- category tells the app what each thing is:
--   dry_cleaning → clothes: counted in the clothes table on the daily report
--   product      → the shop's detergents: printed under Products
--   extra        → hangers, covers, bags, containers: also printed under Products
--
-- If this table is empty, the app falls back to the built-in list in
-- lib/item-catalog.json, and /items offers a one-click button to copy that list
-- in here. Run this script once, then run scripts/add-item-categories.sql so
-- the categories can be edited too.

CREATE TABLE IF NOT EXISTS public.item_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'dry_cleaning'
    CHECK (category IN ('dry_cleaning', 'product', 'extra')),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_catalog_category
  ON public.item_catalog(category);

ALTER TABLE public.item_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on item_catalog" ON public.item_catalog;
CREATE POLICY "Allow all on item_catalog"
  ON public.item_catalog FOR ALL USING (true);

GRANT ALL ON public.item_catalog TO authenticated;
GRANT ALL ON public.item_catalog TO anon;
