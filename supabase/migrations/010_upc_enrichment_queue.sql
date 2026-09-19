-- DVD Inventory
-- Migration 010: queue unknown UPCs for metadata enrichment.

begin;

delete from public.enrichment_queue older
using public.enrichment_queue newer
where older.physical_release_id = newer.physical_release_id
  and older.id < newer.id;

create unique index enrichment_queue_release_unique
on public.enrichment_queue (physical_release_id);

insert into public.enrichment_queue (
    physical_release_id,
    status
)
select
    id,
    'pending'
from public.physical_releases
where metadata_status in ('unknown', 'incomplete', 'needs_review')
on conflict (physical_release_id) do nothing;

create or replace function public.add_inventory_by_codes(
    p_tote_code text,
    p_upc text,
    p_quantity integer default 1,
    p_notes text default null
)
returns public.inventory
language plpgsql
security definer
set search_path = ''
as $$
declare
    normalized_tote_code text;
    normalized_upc text;
    selected_tote_id bigint;
    selected_release_id bigint;
    selected_release_status text;
begin
    perform private.require_active_user();

    normalized_tote_code := pg_catalog.upper(
        pg_catalog.btrim(p_tote_code)
    );
    normalized_upc := pg_catalog.regexp_replace(
        pg_catalog.btrim(p_upc),
        '[[:space:]]+',
        '',
        'g'
    );

    if normalized_tote_code = '' then
        raise exception 'Tote code is required.';
    end if;

    if normalized_tote_code !~ '^TOTE-[0-9]{5}$' then
        raise exception 'Tote code must use the format TOTE-00001.';
    end if;

    if normalized_upc ~ '^0[0-9]{12}$' then
        normalized_upc := pg_catalog.substr(normalized_upc, 2);
    end if;

    if normalized_upc !~ '^([0-9]{8}|[0-9]{12,14})$' then
        raise exception
            'Barcode must contain 8, 12, 13, or 14 digits. Include the small digits at both ends of a UPC.';
    end if;

    if p_quantity <= 0 then
        raise exception 'Quantity must be greater than zero.';
    end if;

    select id
    into selected_tote_id
    from public.totes
    where tote_code = normalized_tote_code
      and archived_at is null;

    if selected_tote_id is null then
        if exists (
            select 1
            from public.totes
            where tote_code = normalized_tote_code
              and archived_at is not null
        ) then
            raise exception 'Tote % is archived.', normalized_tote_code;
        end if;

        raise exception 'Tote % does not exist.', normalized_tote_code;
    end if;

    insert into public.physical_releases (
        upc,
        format,
        metadata_status
    )
    values (
        normalized_upc,
        'DVD',
        'unknown'
    )
    on conflict (upc) do nothing;

    select id, metadata_status
    into selected_release_id, selected_release_status
    from public.physical_releases
    where upc = normalized_upc;

    if selected_release_id is null then
        raise exception 'DVD release could not be created.';
    end if;

    if selected_release_status in ('unknown', 'incomplete', 'needs_review') then
        insert into public.enrichment_queue (
            physical_release_id,
            status
        )
        values (
            selected_release_id,
            'pending'
        )
        on conflict (physical_release_id) do nothing;
    end if;

    return public.inventory_add(
        selected_tote_id,
        selected_release_id,
        p_quantity,
        p_notes
    );
end;
$$;

commit;
