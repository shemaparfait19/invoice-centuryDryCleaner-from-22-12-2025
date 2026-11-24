-- Optional clothes photos for invoices.
-- Run this once in Supabase -> SQL Editor.
--
-- Photos are taken/uploaded by the app after being compressed to a small
-- JPEG (long edge 1400px, ~100-200 KB). `item_label` is the invoice line
-- description the photo belongs to ("Shirt", "Shoes"...) or NULL for a
-- photo of the whole order.
--
-- The bucket is public so the browser can build image URLs directly with
-- the anon key (same access model as the rest of the app, which has no
-- login). Object names are random UUIDs, so they are not guessable.

create table if not exists public.invoice_photos (
  id uuid primary key default gen_random_uuid(),
  invoice_id varchar(20) not null references public.invoices(id) on delete cascade,
  item_label text,
  storage_path text not null unique,
  bytes integer not null default 0,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_photos_invoice_id
  on public.invoice_photos(invoice_id);

alter table public.invoice_photos enable row level security;

drop policy if exists "Allow all operations on invoice_photos" on public.invoice_photos;
create policy "Allow all operations on invoice_photos"
  on public.invoice_photos for all using (true) with check (true);

-- Storage bucket for the image files themselves.
insert into storage.buckets (id, name, public)
values ('invoice-photos', 'invoice-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "invoice photos read" on storage.objects;
drop policy if exists "invoice photos write" on storage.objects;
drop policy if exists "invoice photos delete" on storage.objects;

create policy "invoice photos read" on storage.objects
  for select using (bucket_id = 'invoice-photos');

create policy "invoice photos write" on storage.objects
  for insert with check (bucket_id = 'invoice-photos');

create policy "invoice photos delete" on storage.objects
  for delete using (bucket_id = 'invoice-photos');
