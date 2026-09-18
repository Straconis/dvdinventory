-- DVD Inventory
-- Migration 007: atomic inventory entry by tote code and UPC.

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

    if normalized_upc !~ '^[0-9]{8,14}$' then
        raise exception 'UPC must contain 8 to 14 digits.';
    end if;

    if p_quantity <= 0 then
        raise exception 'Quantity must be greater than zero.';
    end if;

    select id
    into selected_tote_id
    from public.totes
    where tote_code = normalized_tote_code;

    if selected_tote_id is null then
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

    select id
    into selected_release_id
    from public.physical_releases
    where upc = normalized_upc;

    if selected_release_id is null then
        raise exception 'DVD release could not be created.';
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
