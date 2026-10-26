=== DVD Inventory ===
Contributors: straconis
Tags: dvd, inventory, collection, catalog
Requires at least: 6.4
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A self-contained DVD collection for an existing WordPress site. No external services or accounts.

== Description ==

Manage DVD editions, manually entered UPC/barcodes, release years, formats, genres,
tote/shelf locations, copy counts, loan counts, private notes, and uploaded covers.
Search by title or UPC and filter by format. Private inventory searches also
include tote/shelf locations. Responsive cards and server-side pagination work
without frontend JavaScript. CSV exports are available to administrators.

Records live in the WordPress database. Covers live in the WordPress media library.
The plugin makes no external service requests and bundles all its own assets.
There are no API keys, subscriptions, telemetry, remote fonts, CDNs, or enrichment
providers. WordPress and other installed plugins retain their own normal behavior.

== Installation ==

1. Upload dvd-inventory.zip at Plugins > Add New Plugin > Upload Plugin.
2. Activate DVD Inventory.
3. Open DVD Inventory > Add DVD. Enter a title, details, and optional cover; Publish.
4. Create a page and add a Shortcode block containing [dvd_inventory].
5. View the page while signed in as an administrator.

The site must support installation of custom WordPress plugins. This does not
replace or modify your theme, existing pages, or other content.

== Shortcode ==

[dvd_inventory]
Private inventory, available to administrators by default.

[dvd_inventory public="yes"]
Public catalog: published titles, covers, formats, genres, years, UPCs, and copy
availability. Storage locations, private notes, and edit links are omitted even
when an administrator is viewing public mode. Anyone who can access this page
can view the public catalog. Only use this option when you intend to share it.

[dvd_inventory per_page="24"]
Choose a page size from 1 to 96. Options may be combined. Use one inventory
shortcode per page; query parameters are shared across instances.

== Working with copies and loans ==

Each record is a DVD edition. Multiple copies of the same edition belong in its
total copies count. Separate editions can have their own records and UPCs.
UPCs remain text to preserve leading zeros. Duplicate UPCs are permitted.
Keep borrower names and due dates in private notes. Update copies on loan when
lending and returning discs. Available copies = total copies minus copies on
loan. Saving clamps negative counts to zero and loans to the total copy count.
Counts are limited to 1,000,000; release years must be 1888–9999 or blank.

Administration is granted to WordPress administrators on activation. Other roles
are not granted inventory capabilities. Drafts, scheduled items, private posts,
and trashed records never appear in the shortcode catalog.

Private notes are not password-encrypted; administrators and database operators
can read them. Protect backups as you would other WordPress database backups.

== Export and backups ==

DVD Inventory > Setup & export downloads a CSV of non-trashed records, including
drafts, private notes, and cover attachment IDs. The export protects against
spreadsheet formula injection by prefixing dangerous cells with an apostrophe.
Set UPC columns to text when opening CSVs in a spreadsheet to retain leading zeros.
CSV is an export, not a complete backup or an import format for this version.
Back up your database and wp-content/uploads together for a full restore.

Deactivation and deletion preserve records and images. Reinstalling and activating
the plugin restores access. No database tables or media are removed automatically.

== Current scope ==

This release uses manual entry and cover uploads. A keyboard-style USB/Bluetooth
barcode scanner can type into the UPC field, but automatic barcode identification,
camera scanning, CSV import, per-copy loan history, and reminder delivery are not
included. There is no migration or connection to the standalone DVD Inventory app.
There are no external requests to identify titles or download artwork.

== Changelog ==

= 1.0.0 =
* Initial self-contained WordPress plugin.
