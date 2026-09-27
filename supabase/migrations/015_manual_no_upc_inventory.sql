-- DVD Inventory
-- Migration 015: allow manual inventory entry for DVDs without UPCs.

begin;

create or replace function public.add_inventory_without_upc(
    p_tote_code text,
    p_release_title text,
    p_edition text default null,
    p_quantity integer default 1,
    p_notes text default null
)
returns public.inventory
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid;
    normalized_tote_code text;
    selected_tote_id bigint;
    selected_release_id bigint;
    release_title text;
    release_edition text;
    generated_upc text;
    result public.inventory;
begin
    caller := private.require_active_user();

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

    release_title := pg_catalog.btrim(p_release_title);
    release_edition := pg_catalog.nullif(pg_catalog.btrim(p_edition), '');

    if normalized_tote_code = '' then
        raise exception 'Tote name is required.';
    end if;

    if pg_catalog.length(normalized_tote_code) > 50 then
        raise exception 'Tote name must be 50 characters or fewer.';
    end if;

    if normalized_tote_code ~ '[[:cntrl:]]' then
        raise exception 'Tote name contains unsupported characters.';
    end if;

    if release_title = '' then
        raise exception 'DVD title is required.';
    end if;

    if pg_catalog.length(release_title) > 300 then
        raise exception 'DVD title must be 300 characters or fewer.';
    end if;

    if release_edition is not null and pg_catalog.length(release_edition) > 200 then
        raise exception 'Edition must be 200 characters or fewer.';
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

    loop
        generated_upc := 'NO-UPC-' || pg_catalog.substr(
            pg_catalog.md5(
                pg_catalog.clock_timestamp()::text ||
                pg_catalog.random()::text ||
                caller::text
            ),
            1,
            16
        );

        insert into public.physical_releases (
            upc,
            release_title,
            edition,
            format,
            metadata_status,
            created_by,
            notes
        )
        values (
            generated_upc,
            release_title,
            release_edition,
            'DVD',
            'verified',
            caller,
            'Manual entry without UPC.'
        )
        on conflict (upc) do nothing
        returning id into selected_release_id;

        exit when selected_release_id is not null;
    end loop;

    result := public.inventory_add(
        selected_tote_id,
        selected_release_id,
        p_quantity,
        p_notes
    );

    return result;
end;
$$;

revoke all on function public.add_inventory_without_upc(
    text,
    text,
    text,
    integer,
    text
)
from public, anon;

grant execute on function public.add_inventory_without_upc(
    text,
    text,
    text,
    integer,
    text
)
to authenticated;

commit;
