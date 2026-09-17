# DVD Inventory Users

Planned application identities:

| Username | Display Name | Role |
|----------|--------------|------|
| sam | Sam | user |
| michael | Michael | user |
| steve | Steve | admin |

Authentication users must be provisioned separately.

Never commit:

- passwords
- sb_secret keys
- service_role keys
- database passwords

The browser application contains only the Supabase Project URL and
publishable key.

Application authorization is enforced by PostgreSQL Row Level Security.
