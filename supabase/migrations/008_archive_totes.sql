-- DVD Inventory
-- Migration 008: reversible tote archiving with inventory safeguards.

begin;

alter table public.totes
    add column archived_at timestamptz,
    add column archived_by uuid references auth.users(id) on delete set null;

create index totes_archived_at_idx
on public.totes (archived_at);

create or replace function private.reject_archived_tote_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.quantity > 0 and exists (
        select 1
        from public.totes
        where id = new.tote_id
          and archived_at is not null
    ) then
        raise exception 'Archived totes cannot receive inventory.';
    end if;

    return new;
end;
$$;

revoke all
on function private.reject_archived_tote_inventory()
from public, anon, authenticated;

drop trigger if exists inventory_reject_archived_tote
on public.inventory;

create trigger inventory_reject_archived_tote
before insert or update of tote_id, quantity
on public.inventory
for each row
execute function private.reject_archived_tote_inventory();

create or replace function public.set_tote_archived(
    p_tote_id bigint,
    p_archived boolean
)
returns public.totes
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid;
    result public.totes;
begin
    caller := private.require_active_user();

    select *
    into result
    from public.totes
    where id = p_tote_id
    for update;

    if not found then
        raise exception 'Tote does not exist.';
    end if;

    if p_archived and exists (
        select 1
        from public.inventory
        where tote_id = p_tote_id
          and quantity > 0
    ) then
        raise exception 'Tote cannot be archived while it contains inventory.';
    end if;

    update public.totes
    set archived_at = case
            when p_archived then coalesce(archived_at, pg_catalog.now())
            else null
        end,
        archived_by = case
            when p_archived then coalesce(archived_by, caller)
            else null
        end
    where id = p_tote_id
    returning * into result;

    return result;
end;
$$;

revoke all
on function public.set_tote_archived(bigint, boolean)
from public, anon, authenticated;

grant execute
on function public.set_tote_archived(bigint, boolean)
to authenticated;

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

commit;
