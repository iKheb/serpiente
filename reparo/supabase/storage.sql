-- ============================================================================
-- Reparo · Fotos de evidencia en la nube (Supabase Storage)
-- Pega TODO este script en Supabase → SQL Editor → New query → Run.
-- Es un añadido al primer script (schema.sql). Se puede ejecutar más de una vez.
-- ============================================================================

-- Espacio PRIVADO para las fotos (máx. 10 MB por archivo, sólo imágenes).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reparo-fotos', 'reparo-fotos', false, 10485760, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cada cuenta sólo puede ver, subir, cambiar y borrar fotos dentro de su
-- propia carpeta: reparo-fotos/<id-de-tu-cuenta>/...
drop policy if exists "reparo_fotos_select_own" on storage.objects;
drop policy if exists "reparo_fotos_insert_own" on storage.objects;
drop policy if exists "reparo_fotos_update_own" on storage.objects;
drop policy if exists "reparo_fotos_delete_own" on storage.objects;

create policy "reparo_fotos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'reparo-fotos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "reparo_fotos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reparo-fotos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "reparo_fotos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'reparo-fotos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'reparo-fotos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "reparo_fotos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'reparo-fotos' and (storage.foldername(name))[1] = auth.uid()::text);
