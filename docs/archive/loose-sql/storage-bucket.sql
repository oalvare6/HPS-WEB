-- Create storage bucket for waiver signatures (run in Supabase SQL Editor if not using migrations)
insert into storage.buckets (id, name, public)
values ('waiver-signatures', 'waiver-signatures', false)
on conflict (id) do nothing;
