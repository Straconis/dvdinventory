-- DVD Inventory
-- Migration 009: administrator-only inventory data purge.
-- User accounts, profiles, and user administration history are preserved.

begin;

alter table public.user_admin_audit
    drop constraint if exists user_admin_audit_action_check;

alter table public.user_admin_audit
    add constraint user_admin_audit_action_check
    check (
        action in (
            'user_created',
            'user_activated',
            'user_deactivated',
            'role_changed',
            'password_reset_requested',
            'password_changed',
            'inventory_purged'
        )
    );

create or replace function public.admin_purge_inventory_data(
    p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid;
    counts jsonb;
begin
    caller := auth.uid();

    if caller is null then
        raise exception 'Authentication required.';
    end if;

    if not private.current_user_is_admin() then
        raise exception 'Administrator privileges required.';
    end if;

    if p_confirmation is distinct from 'PURGE INVENTORY' then
        raise exception 'Exact purge confirmation is required.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(1749238601);

    select pg_catalog.jsonb_build_object(
        'totes', (select count(*) from public.totes),
        'titles', (select count(*) from public.titles),
        'physical_releases', (select count(*) from public.physical_releases),
        'inventory_rows', (select count(*) from public.inventory),
        'checkouts', (select count(*) from public.checkouts),
        'transactions', (select count(*) from public.inventory_transactions),
        'metadata_records', (select count(*) from public.metadata_provenance),
        'enrichment_records', (select count(*) from public.enrichment_queue)
    )
    into counts;

    truncate table
        public.inventory_transactions,
        public.checkouts,
        public.inventory,
        public.metadata_provenance,
        public.enrichment_queue,
        public.physical_releases,
        public.titles,
        public.totes
    restart identity;

    insert into public.user_admin_audit (
        target_username,
        action,
        old_value,
        new_value,
        performed_by
    )
    values (
        'inventory system',
        'inventory_purged',
        counts::text,
        'All inventory data and history removed',
        caller
    );

    return counts;
end;
$$;

revoke all
on function public.admin_purge_inventory_data(text)
from public, anon, authenticated;

grant execute
on function public.admin_purge_inventory_data(text)
to authenticated;

commit;
