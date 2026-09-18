-- DVD Inventory
-- Migration 006: safe deletion of empty, unused totes
--
-- This deliberately does not grant DELETE on public.totes. Authenticated,
-- active users receive only this narrow operation, and historical references
-- prevent deletion even when the current inventory quantity is zero.

begin;

create or replace function public.delete_empty_tote(
    p_tote_id bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_code text;
begin
    perform private.require_active_user();

    select tote_code
    into target_code
    from public.totes
    where id = p_tote_id
    for update;

    if not found then
        raise exception 'Tote does not exist.';
    end if;

    if exists (
        select 1
        from public.inventory
        where tote_id = p_tote_id
    ) then
        raise exception
            'Tote cannot be deleted because it has inventory records.';
    end if;

    if exists (
        select 1
        from public.checkouts
        where source_tote_id = p_tote_id
           or return_tote_id = p_tote_id
    ) then
        raise exception
            'Tote cannot be deleted because it has checkout history.';
    end if;

    if exists (
        select 1
        from public.inventory_transactions
        where tote_id = p_tote_id
    ) then
        raise exception
            'Tote cannot be deleted because it has transaction history.';
    end if;

    delete from public.totes
    where id = p_tote_id;

    return target_code;
end;
$$;

revoke all
on function public.delete_empty_tote(bigint)
from public, anon, authenticated;

grant execute
on function public.delete_empty_tote(bigint)
to authenticated;

commit;
