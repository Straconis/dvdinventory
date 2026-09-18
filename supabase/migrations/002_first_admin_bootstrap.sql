-- DVD Inventory
-- Migration 002: tightly constrained first-administrator bootstrap.
--
-- This function exists only to establish the first application profile.
-- It can only create a profile for the currently authenticated auth user.
-- The first profile is always an active administrator.
-- Once any profile exists, this function can never bootstrap another user.

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
        pg_catalog.nullif(
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
