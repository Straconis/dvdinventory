# DVD Inventory for WordPress

Install `../dist/dvd-inventory.zip` through **Plugins → Add New Plugin → Upload
Plugin**, activate it, and add `[dvd_inventory]` to a page’s Shortcode block.
The inventory is restricted to administrators by default. Use
`[dvd_inventory public="yes"]` for an intentionally public catalog.

The plugin is independent of the existing app in `latest/`. It uses WordPress
posts and metadata for records and the media library for covers, with no external
services, packages, build step, or API credentials at runtime.

See `dvd-inventory/readme.txt` for setup, permissions, backup instructions, and
the limits of this release.

## Package

Run `python3 wordpress/package.py` from the repository root. The ZIP has a single
`dvd-inventory/` directory and includes only installable plugin files.

## Verify

Run PHP lint on `dvd-inventory/dvd-inventory.php` and JavaScript syntax checking
on `dvd-inventory/assets/admin.js`.

`wordpress/tests/integration.php` runs against a **disposable WordPress install**:

```sh
DVDI_WP_ROOT=/path/to/disposable/wordpress php wordpress/tests/integration.php
```

The test bootstraps WordPress, activates the plugin in-process, creates fixtures,
checks permissions, saves, search, pagination, HTML escaping, public privacy, and
CSV cell handling, then deletes its fixtures. Do not run against production.
