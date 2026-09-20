-- Record administrator changes to the password reset requirement.

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
            'password_reset_required',
            'password_reset_cleared',
            'password_changed',
            'email_changed',
            'inventory_purged'
        )
    );

commit;
