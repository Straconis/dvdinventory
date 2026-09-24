-- DVD Inventory
-- Migration 014: allow custom tote names in inventory workflows.

begin;

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
        pg_catalog.regexp_replace(
            pg_catalog.btrim(p_tote_code),
            '[[:space:]]+',
            ' ',
            'g'
        )
    );
    normalized_tote_code := pg_catalog.regexp_replace(
        normalized_tote_code,
        '[[:space:]]*-[[:space:]]*',
        '-',
        'g'
    );

    if normalized_tote_code ~ '^[0-9]{1,5}$' then
        normalized_tote_code := 'TOTE-' || pg_catalog.lpad(
            normalized_tote_code,
            5,
            '0'
        );
    elsif normalized_tote_code ~ '^TOTE-[0-9]{1,5}$' then
        normalized_tote_code := 'TOTE-' || pg_catalog.lpad(
            pg_catalog.substr(normalized_tote_code, 6),
            5,
            '0'
        );
    end if;

    normalized_upc := pg_catalog.regexp_replace(
        pg_catalog.btrim(p_upc),
        '[[:space:]]+',
        '',
        'g'
    );

    if normalized_tote_code = '' then
        raise exception 'Tote name is required.';
    end if;

    if pg_catalog.length(normalized_tote_code) > 50 then
        raise exception 'Tote name must be 50 characters or fewer.';
    end if;

    if normalized_tote_code ~ '[[:cntrl:]]' then
        raise exception 'Tote name contains unsupported characters.';
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

revoke all on function public.add_inventory_by_codes(
    text,
    text,
    integer,
    text
)
from public, anon;

grant execute on function public.add_inventory_by_codes(
    text,
    text,
    integer,
    text
)
to authenticated;

commit;
