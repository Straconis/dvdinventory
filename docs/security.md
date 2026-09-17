# DVD Inventory Security Model

## Public Code

DVD Inventory is hosted on GitHub Pages.

The HTML, CSS, JavaScript, Supabase Project URL, and Supabase publishable
key are public.

This is expected.

The publishable key is not an administrative credential.

---

## Authentication

Application data requires a valid authenticated Supabase session.

Anonymous users receive no application table permissions.

Public account registration will be disabled.

---

## Roles

DVD Inventory currently defines:

    user
    admin

Normal users perform day-to-day inventory operations.

Administrators additionally manage:

- users
- roles
- metadata administration
- enrichment
- diagnostics
- administrative inventory corrections

---

## Initial Authorization

Initial users:

    Sam       user
    Michael   user
    Steve     admin

Additional administrators may be promoted later.

---

## Administrative Protection

The database protects against:

- self-deactivation
- self-demotion
- unauthorized role changes
- unauthorized account activation changes
- removal of the final active administrator

Administrative actions are audited.

---

## Secrets

Never commit:

- user passwords
- Supabase secret keys
- service_role credentials
- database passwords

Privileged Supabase Auth administration must execute server-side.

---

## Row Level Security

RLS is enabled on all application tables.

Anonymous access is revoked.

Operational access requires an active authenticated profile.

Administrator-only functionality checks the role stored in
public.profiles.

UI visibility is NOT considered a security boundary.

Even if somebody manipulates the browser application, PostgreSQL policies
and protected functions continue to enforce authorization.
