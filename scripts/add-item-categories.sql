-- The shop's own item categories, edited from /items.
--
-- Each category has a key (stored on item_catalog.category), a name staff see,
-- and counts_as, which decides where its items are counted on the daily cash
-- report:
--   dry_cleaning → clothes: counted in the clothes table
--   product      → the shop's detergents: printed under Products
--   extra        → hangers, covers, bags, containers: printed under Products too
--
-- Run this once. It also removes the old fixed-list CHECK on item_catalog so
-- any category you create can be used by items.

CREATE TABLE IF NOT EXISTS public.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  counts_as TEXT NOT NULL DEFAULT 'dry_cleaning'
    CHECK (counts_as IN ('dry_cleaning', 'product', 'extra')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The three categories the app ships with.
INSERT INTO public.item_categories (key, name, counts_as)
VALUES
  ('dry_cleaning', 'Dry cleaning', 'dry_cleaning'),
  ('product', 'Product', 'product'),
  ('extra', 'Extra', 'extra')
ON CONFLICT (key) DO NOTHING;

-- Any category already used by an item but not declared yet.
DO $$
DECLARE
  constraint_name RECORD;
BEGIN
  IF to_regclass('public.item_catalog') IS NOT NULL THEN
    INSERT INTO public.item_categories (key, name, counts_as)
    SELECT DISTINCT
      category,
      initcap(replace(category, '_', ' ')),
      'dry_cleaning'
    FROM public.item_catalog
    WHERE category IS NOT NULL AND category <> ''
    ON CONFLICT (key) DO NOTHING;

    -- Let items use categories created from /items.
    FOR constraint_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.item_catalog'::regclass
        AND contype = 'c'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.item_catalog DROP CONSTRAINT %I',
        constraint_name.conname
      );
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on item_categories" ON public.item_categories;
CREATE POLICY "Allow all on item_categories"
  ON public.item_categories FOR ALL USING (true);

GRANT ALL ON public.item_categories TO authenticated;
GRANT ALL ON public.item_categories TO anon;
