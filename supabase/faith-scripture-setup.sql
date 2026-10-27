BEGIN;
SELECT pg_advisory_xact_lock(20261030);
DO $install$ BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL OR NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611230001')THEN RAISE EXCEPTION 'Verify Phase 7 Study Builder migration history first.';END IF;
 IF NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611240001')THEN
  IF to_regclass('public.scripture_reference_bookmarks')IS NOT NULL OR to_regprocedure('public.scripture_reference_command(text,text,uuid,uuid,integer)')IS NOT NULL THEN RAISE EXCEPTION 'Scripture objects exist without a migration record. Inspect history; do not reset.';END IF;
  EXECUTE $migration$
-- Personal references only; no Bible text, translation content or private Circle metadata.
create function private.scripture_reference_valid(p_reference text)returns boolean language plpgsql immutable set search_path=''as $$
declare m text[];chapters integer;catalogue jsonb:='{"Genesis":50,"Exodus":40,"Leviticus":27,"Numbers":36,"Deuteronomy":34,"Joshua":24,"Judges":21,"Ruth":4,"1 Samuel":31,"2 Samuel":24,"1 Kings":22,"2 Kings":25,"1 Chronicles":29,"2 Chronicles":36,"Ezra":10,"Nehemiah":13,"Esther":10,"Job":42,"Psalms":150,"Proverbs":31,"Ecclesiastes":12,"Song of Songs":8,"Isaiah":66,"Jeremiah":52,"Lamentations":5,"Ezekiel":48,"Daniel":12,"Hosea":14,"Joel":3,"Amos":9,"Obadiah":1,"Jonah":4,"Micah":7,"Nahum":3,"Habakkuk":3,"Zephaniah":3,"Haggai":2,"Zechariah":14,"Malachi":4,"Matthew":28,"Mark":16,"Luke":24,"John":21,"Acts":28,"Romans":16,"1 Corinthians":16,"2 Corinthians":13,"Galatians":6,"Ephesians":6,"Philippians":4,"Colossians":4,"1 Thessalonians":5,"2 Thessalonians":3,"1 Timothy":6,"2 Timothy":4,"Titus":3,"Philemon":1,"Hebrews":13,"James":5,"1 Peter":5,"2 Peter":3,"1 John":5,"2 John":1,"3 John":1,"Jude":1,"Revelation":22}'::jsonb;begin
 if p_reference is null or length(p_reference)>100 then return false;end if;
 m:=regexp_match(p_reference,'^(.+) ([1-9][0-9]{0,2})(:([1-9][0-9]{0,2})(-([1-9][0-9]{0,2}))?)?$');
 if m is null then return false;end if;
 chapters:=(catalogue->>m[1])::integer;
 return coalesce(chapters is not null and m[2]::integer<=chapters and (m[4]is null or m[4]::integer<=176)and(m[6]is null or(m[6]::integer<=176 and m[6]::integer>=m[4]::integer)),false);
end$$;
create function public.scripture_bookmark_access()returns boolean language sql stable security definer set search_path=''as $$select private.squad_live(auth.uid())$$;
create table public.scripture_reference_bookmarks(
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid()references auth.users on delete cascade,
 reference text not null check(private.scripture_reference_valid(reference)),created_at timestamptz not null default now(),unique(user_id,reference)
);
create index scripture_bookmarks_page on public.scripture_reference_bookmarks(user_id,created_at desc,id desc);
alter table public.scripture_reference_bookmarks enable row level security;
revoke all on public.scripture_reference_bookmarks from public,anon,authenticated;
grant select on public.scripture_reference_bookmarks to authenticated;
grant all on public.scripture_reference_bookmarks to service_role;
create policy scripture_bookmark_owner on public.scripture_reference_bookmarks for select to authenticated using(user_id=auth.uid()and public.scripture_bookmark_access());
create function public.scripture_reference_command(p_operation text,p_reference text default null,p_id uuid default null,p_after uuid default null,p_size integer default 20)returns jsonb language plpgsql security definer set search_path=''as $$
declare actor uuid:=auth.uid();b public.scripture_reference_bookmarks;cursor_row public.scripture_reference_bookmarks;items jsonb;begin
 if not private.squad_live(actor)then raise exception 'Unavailable'using errcode='42501';end if;
 if p_operation is null or p_operation not in('list','save','delete')or p_size is null or p_size not between 1 and 40 then raise exception 'Invalid query'using errcode='22023';end if;
 if not private.take_limit('scripture-'||case when p_operation='list'then'read'else'write'end||':'||actor::text,case when p_operation='list'then 180 else 60 end,60)then return jsonb_build_object('limited',true);end if;
 if p_operation='list'then
  if p_after is not null then select *into cursor_row from public.scripture_reference_bookmarks where id=p_after and user_id=actor;if not found then raise exception 'Unavailable'using errcode='42501';end if;end if;
  select coalesce(jsonb_agg(q order by q.created_at desc,q.id desc),'[]')into items from(select id,reference,created_at from public.scripture_reference_bookmarks where user_id=actor and(p_after is null or(created_at,id)<(cursor_row.created_at,cursor_row.id))order by created_at desc,id desc limit p_size+1)q;
  return jsonb_build_object('items',items);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('scripture:'||actor::text,0));
 if p_operation='delete'then delete from public.scripture_reference_bookmarks where id=p_id and user_id=actor;return jsonb_build_object('ok',true);end if;
 if not private.scripture_reference_valid(p_reference)then raise exception 'Invalid reference'using errcode='22023';end if;
 if(select count(*)from public.scripture_reference_bookmarks where user_id=actor)>=200 and not exists(select 1 from public.scripture_reference_bookmarks where user_id=actor and reference=p_reference)then raise exception 'Bookmark limit reached'using errcode='22023';end if;
 insert into public.scripture_reference_bookmarks(user_id,reference)values(actor,p_reference)on conflict(user_id,reference)do nothing;
 select *into b from public.scripture_reference_bookmarks where user_id=actor and reference=p_reference;
 return jsonb_build_object('ok',true,'bookmark',to_jsonb(b)-'user_id');
end$$;
revoke all on function private.scripture_reference_valid(text),public.scripture_bookmark_access(),public.scripture_reference_command(text,text,uuid,uuid,integer)from public,anon,authenticated;
grant execute on function public.scripture_bookmark_access(),public.scripture_reference_command(text,text,uuid,uuid,integer)to authenticated;
create function public.scripture_reader_admit()returns boolean language sql security definer set search_path=''as $$select private.squad_live(auth.uid())and private.take_limit('scripture-provider:'||auth.uid()::text,60,60)$$;
revoke all on function public.scripture_reader_admit()from public,anon,authenticated;grant execute on function public.scripture_reader_admit()to authenticated;
notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('202611240001','scripture_references',array['Private Scripture reference bookmarks']);
 END IF;
END $install$;
COMMIT;
