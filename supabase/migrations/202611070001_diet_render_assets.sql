insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diet-renders', 'diet-renders', false, 8388608, array['image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "diet renders read own" on storage.objects;
create policy "diet renders read own" on storage.objects
for select to authenticated
using (bucket_id = 'diet-renders' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "diet renders delete own" on storage.objects;
create policy "diet renders delete own" on storage.objects
for delete to authenticated
using (bucket_id = 'diet-renders' and (storage.foldername(name))[1] = auth.uid()::text);
