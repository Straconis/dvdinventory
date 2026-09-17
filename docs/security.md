# DVD Inventory Security

## Public application code

DVD Inventory is hosted by GitHub Pages.

The HTML, CSS, JavaScript, Supabase Project URL, and Supabase publishable
key are therefore public information.

This is expected.

The publishable key does not grant administrative access.

## Protected data

Inventory data is protected by:

1. Supabase Authentication
2. authenticated user JWTs
3. PostgreSQL Row Level Security
4. application roles stored in public.profiles

Anonymous users receive no database table permissions.

## Roles

### user

Normal DVD Inventory operation.

Initial users:

- Sam
- Michael

### admin

Normal operation plus administrative capabilities.

Initial administrator:

- Steve

## Secrets

The following must NEVER be committed to GitHub:

- account passwords
- Supabase secret key
- legacy service_role key
- database password

## Authentication

Public account registration will be disabled.

Accounts are intentionally provisioned by an administrator.

## Auditability

Inventory transactions record the authenticated user's UUID in
performed_by.

The application resolves that UUID through public.profiles for display.
