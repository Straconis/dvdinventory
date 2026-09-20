-- Allow administrator email changes to be recorded in the audit log.

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
            'email_changed',
            'inventory_purged'
        )
    );

commit;
