# DVD Inventory User Administration

## Initial Users

| Username | Display Name | Role |
|----------|--------------|------|
| sam | Sam | user |
| michael | Michael | user |
| steve | Steve | admin |

Steve is the initial administrator.

The application does NOT permanently hard-code Steve as the only admin.

Other users may later be promoted to administrator.

---

## User Administration

Administrators may:

- create users
- deactivate users
- reactivate users
- initiate password resets
- promote users to admin
- demote admins to user
- view user administration history
- view activity associated with a user

---

## Account Removal

Normal account removal should be implemented as deactivation.

This preserves historical attribution.

For example:

    Sam checked out DVD X

must remain attributable to Sam even if Sam no longer has access.

Deleting the Auth identity should therefore be considered a separate
administrative cleanup operation rather than the normal Remove User action.

---

## Safety Rules

### Administrators cannot deactivate themselves

An administrator must use another administrator account to deactivate their
own account.

### Administrators cannot change their own role

An administrator must use another administrator account to demote them.

### The final active administrator is protected

The database rejects any operation that would leave DVD Inventory with zero
active administrators.

### Promotion is supported

Any active user may be promoted by an administrator.

Example:

    Steve      admin
    Sam        user
    Michael    user

Later:

    Steve      admin
    Sam        admin
    Michael    user

Steve is therefore the initial administrator, not a permanently special
hard-coded account.

---

## Authentication User Creation

Creation of actual Supabase Auth users requires privileged server-side
execution.

The GitHub Pages browser application must NEVER contain:

- a Supabase secret key
- a service_role key
- the database password

The Admin Users screen will call a protected server-side function for
operations requiring Supabase Auth administration.

That function must independently verify that the caller is an administrator.

---

## Audit

Administrative changes are written to:

    public.user_admin_audit

Tracked operations include:

- user created
- user activated
- user deactivated
- role changed
- password reset requested

Role changes preserve both the previous and new value.
