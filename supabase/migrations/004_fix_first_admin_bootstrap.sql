-- DVD Inventory
-- Migration 004: fix first-administrator bootstrap.
--
-- Migration 002 incorrectly schema-qualified NULLIF as
-- pg_catalog.nullif(...). NULLIF is a SQL expression rather than
-- a normal pg_catalog function, causing bootstrap execution to fail
-- with PostgreSQL error 42883.
--
-- This forward migration replaces the bootstrap function with the
-- corrected implementation. Applied migrations are never rewritten.

begin;

create or replace function public.bootstrap_first_admin(
    requested_username text,
    requested_display_name text,
    requested_contact_email text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid;
    result public.profiles;
begin
    caller := auth.uid();

    if caller is null then
        raise exception 'Authentication required.';
    end if;

    if requested_username is null
       or pg_catalog.btrim(requested_username) = '' then
        raise exception 'Username is required.';
    end if;

    if requested_display_name is null
       or pg_catalog.btrim(requested_display_name) = '' then
        raise exception 'Display name is required.';
    end if;

    -- Serialize bootstrap attempts so two simultaneous requests
    -- cannot both become the first profile.
    perform pg_catalog.pg_advisory_xact_lock(1480941638);

    if exists (
        select 1
        from public.profiles
    ) then
        raise exception 'Initial administrator has already been configured.';
    end if;

    if exists (
        select 1
        from public.profiles
        where id = caller
    ) then
        raise exception 'A profile already exists for this account.';
    end if;

    insert into public.profiles (
        id,
        username,
        display_name,
        contact_email,
        role,
        active,
        must_change_password
    )
    values (
        caller,
        pg_catalog.lower(pg_catalog.btrim(requested_username)),
        pg_catalog.btrim(requested_display_name),
        nullif(
            pg_catalog.btrim(requested_contact_email),
            ''
        ),
        'admin',
        true,
        true
    )
    returning *
    into result;

    return result;
end;
$$;

-- Reassert the intended execution privileges explicitly.
revoke all on function public.bootstrap_first_admin(
    text,
    text,
    text
) from public;

revoke all on function public.bootstrap_first_admin(
    text,
    text,
    text
) from anon;

grant execute on function public.bootstrap_first_admin(
    text,
    text,
    text
) to authenticated;

commit;
