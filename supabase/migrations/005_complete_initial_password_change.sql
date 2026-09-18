-- DVD Inventory
-- Migration 005
--
-- Provides the narrow database operation required after an authenticated
-- user successfully changes an initial/temporary password through
-- Supabase Auth.
--
-- Security properties:
--   * caller identity comes only from auth.uid()
--   * caller must already have an active application profile
--   * caller may clear only their own must_change_password flag
--   * no user ID is accepted from the client
--   * role and active status cannot be changed here
--   * anonymous callers cannot execute the function

begin;

create or replace function public.complete_initial_password_change()
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

    if result.must_change_password is true then
        update public.profiles
        set must_change_password = false
        where id = caller
        returning *
        into result;
    end if;

    return result;
end;
$$;

revoke all
on function public.complete_initial_password_change()
from public, anon, authenticated;

grant execute
on function public.complete_initial_password_change()
to authenticated;

commit;
