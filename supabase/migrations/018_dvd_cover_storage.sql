begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dvd-covers', 'dvd-covers', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Cover art is publicly readable, like existing provider cover URLs.
-- Only active inventory users may upload or clean up their uploads.
create policy dvd_covers_insert on storage.objects
for insert to authenticated
with check (
    bucket_id = 'dvd-covers'
    and private.current_user_is_active()
    and exists (
        select 1 from public.physical_releases
        where id::text = (storage.foldername(name))[1]
    )
);

create policy dvd_covers_select on storage.objects
for select to authenticated
using (bucket_id = 'dvd-covers' and private.current_user_is_active());

create policy dvd_covers_delete on storage.objects
for delete to authenticated
using (
    bucket_id = 'dvd-covers'
    and private.current_user_is_active()
    and owner_id = (select auth.uid())::text
);

commit;
