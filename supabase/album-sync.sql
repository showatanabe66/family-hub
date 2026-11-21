-- Account-owned album records; images remain in a private Storage bucket.
create table public.album_records (
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id uuid not null,
 spot_id text check (char_length(spot_id)<=200),
 place_name text not null check (char_length(place_name) between 1 and 200),
 visited_date date not null,
 comment text not null check (char_length(comment) between 1 and 2000),
 photo_path text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version integer not null default 1 check (version>0),
 deleted_at timestamptz,
 primary key (owner_id,id),
 check (photo_path like owner_id::text || '/' || id::text || '/%')
);
alter table public.album_records enable row level security;
revoke all on public.album_records from anon;
grant select,insert,update on public.album_records to authenticated;
create policy album_records_read on public.album_records for select to authenticated using ((select auth.uid())=owner_id);
create policy album_records_create on public.album_records for insert to authenticated with check ((select auth.uid())=owner_id);
create policy album_records_edit on public.album_records for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
-- Tombstones prevent a second device's old local backup from resurrecting deletions.
create index album_records_owner_updated on public.album_records(owner_id,updated_at desc);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('family-album','family-album',false,15728640,array['image/jpeg','image/png','image/webp']);
create policy album_photos_read on storage.objects for select to authenticated
using (bucket_id='family-album' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy album_photos_create on storage.objects for insert to authenticated
with check (bucket_id='family-album' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy album_photos_remove on storage.objects for delete to authenticated
using (bucket_id='family-album' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Replacements use a new immutable object path; no Storage UPDATE/upsert policy is needed.
