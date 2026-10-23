-- Restrictive bucket guards also resist broad permissive policies already
-- present in a shared project (or added later for unrelated storage buckets).
-- The trusted service role still performs validated server-side operations.
create policy avatars_server_only on storage.objects as restrictive
 for all to anon,authenticated
 using (bucket_id <> 'avatars') with check (bucket_id <> 'avatars');
create policy avatar_bucket_server_only on storage.buckets as restrictive
 for all to anon,authenticated
 using (id <> 'avatars') with check (id <> 'avatars');
