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

## Tote contents quantity

The Totes listing shows the total units currently stored in each active or
archived tote, including zero for empty totes. This sums `inventory.quantity`
across releases, rather than counting editions or discs. Checked-out and sold
units are excluded because those operations already reduce stored inventory.
Counts reload with the listing and after inventory changes. Inventory is read
in pages so response limits do not truncate totals. No database migration is
required.

Run the regression suite with `npm test`.

## Missing cover scan

Administrators can use **Administration → Missing Cover Art → Find Missing Covers**
to look up releases without cover art. The scan tries UPC artwork first, then
searches TMDb for an exact, unambiguous movie title match. Posters may differ from
DVD packaging. Existing covers and movie metadata are preserved, including
verified records. Movies without a UPC can use the title fallback. Ambiguous
matches and missing posters require a manual upload.

Progress shows added, unavailable, skipped, and failed lookups. Stop Scan finishes
the current request before stopping. Keep the page open. Running it again skips
covers already added. Provider rate limits pause and retry automatically, respecting Retry-After where
available. Other temporary failures retry three times, then count that release as
failed and continue through the library. Missing/invalid TMDb credentials or an
expired login stop the scan with an actionable message. Only releases without
cover URLs are scanned; existing covers are excluded, with no ten-title limit.

Set the **TMDB_READ_ACCESS_TOKEN** Supabase Edge Function secret to your TMDb API
Read Access Token (not the shorter v3 API key). Keep it out of frontend code and
Git. Obtain it through https://www.themoviedb.org/settings/api using the appropriate
personal/commercial API arrangement. Attribution appears under Artwork credits.
Deploy `enrich-upc` together with the web files. No database migration is required.
