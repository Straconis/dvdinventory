# DVD Inventory

Web-based DVD inventory management system for tracking DVD editions,
tote locations, quantities, checkouts, and returns.

## Planned Features

- UPC-based DVD identification
- Distinct DVD editions tracked by UPC
- Manual barcode/UPC entry
- USB/Bluetooth barcode scanner support
- Phone camera barcode scanning
- Tote barcode support
- Inventory by tote
- DVD search across all totes
- Quantity tracking
- Checkout/check-in system
- Checkout location and user tracking
- Inventory transaction history
- Mobile-friendly web interface

## Missing cover scan

Administrators can use **Administration → Missing Cover Art → Find Missing Covers**
to look up releases without cover art through the existing UPC provider. The scan
preserves existing covers and all movie metadata, including verified records.
Progress shows added, unavailable, skipped, and failed lookups. Stop Scan finishes
the current request before stopping. Keep the page open; provider limits stop the
scan, and running it again skips covers already added. Releases without a usable
UPC require a manually uploaded cover.

Deploy the updated `enrich-upc` Supabase Edge Function together with the web files
for this feature. No database migration or new provider credentials are required.
