-- Create public storage bucket for tournament banner images
-- (run in Supabase SQL Editor if not using migrations)
insert into storage.buckets (id, name, public)
values ('tournament-images', 'tournament-images', true)
on conflict (id) do nothing;

-- Allow public read of tournament images
drop policy if exists "Public read tournament images" on storage.objects;
create policy "Public read tournament images"
on storage.objects for select
using (bucket_id = 'tournament-images');
