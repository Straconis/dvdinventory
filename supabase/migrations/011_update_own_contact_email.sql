-- DVD Inventory
-- Migration 011
--
-- Allows an active authenticated user to update only their own profile
-- contact email after the client has requested the matching Supabase Auth
-- email change.

begin;

create or replace function public.update_own_contact_email(
    new_contact_email text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid;
    normalized_email text;
    result public.profiles;
begin
    caller := auth.uid();

    if caller is null then
        raise exception 'Authentication required.';
    end if;

    normalized_email := lower(pg_catalog.btrim(new_contact_email));

    if normalized_email is null
       or normalized_email = ''
       or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'Enter a valid email address.';
    end if;

    select *
    into result
    from public.profiles
    where id = caller
    for update;

    if not found then
        raise exception 'Application profile not found.';
    end if;

    if result.active is not true then
        raise exception 'Active account required.';
    end if;

    update public.profiles
    set contact_email = normalized_email
    where id = caller
    returning *
    into result;

    return result;
end;
$$;

revoke all
on function public.update_own_contact_email(text)
from public, anon, authenticated;

grant execute
on function public.update_own_contact_email(text)
to authenticated;

commit;
