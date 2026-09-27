-- DVD Inventory
-- Migration 017: provide live aggregate counts for the dashboard.

begin;

create or replace function public.dashboard_stats()
returns table (
    dvd_copies bigint,
    unique_editions bigint,
    totes bigint,
    checked_out bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform private.require_active_user();

    return query
    with available as (
        select
            i.physical_release_id,
            i.quantity::bigint as quantity
        from public.inventory as i
        where i.quantity > 0
    ),
    active_checkouts as (
        select
            c.physical_release_id,
            c.quantity::bigint as quantity
        from public.checkouts as c
        where c.status = 'checked_out'
    ),
    tracked_releases as (
        select a.physical_release_id from available as a
        union
        select c.physical_release_id from active_checkouts as c
    )
    select
        (
            coalesce((select sum(a.quantity) from available as a), 0) +
            coalesce((select sum(c.quantity) from active_checkouts as c), 0)
        )::bigint,
        (select count(*) from tracked_releases)::bigint,
        (
            select count(*)
            from public.totes as t
            where t.archived_at is null
        )::bigint,
        coalesce(
            (select sum(c.quantity) from active_checkouts as c),
            0
        )::bigint;
end;
$$;

revoke all on function public.dashboard_stats()
from public, anon;

grant execute on function public.dashboard_stats()
to authenticated;

commit;
