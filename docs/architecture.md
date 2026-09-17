# DVD Inventory Data Architecture

## Core principle

DVD Inventory tracks physical releases.

A movie title and a physical DVD release are not the same entity.

For example, multiple UPCs may all represent different physical releases of
the same movie.

External metadata providers enhance DVD Inventory but are never required for
inventory operations.

A DVD must always be inventoryable through manual entry.

---

## Tote

A tote represents a physical storage container.

Suggested fields:

- id
- tote_code
- description
- physical_location
- notes
- created_at
- updated_at

Tote codes should be human-readable and barcode-compatible.

Example:

TOTE-00042

---

## Title

A title represents the underlying movie, television program, documentary,
concert, or other content.

Suggested fields:

- id
- title
- original_title
- year
- imdb_id
- tmdb_id
- wikidata_id
- runtime_minutes
- genres
- director
- plot
- poster_url
- created_at
- updated_at

A Title may have many Physical Releases.

---

## Physical Release

A Physical Release represents a specific retail release or edition.

UPC is stored as TEXT.

Never store UPC as a numeric database type.

Suggested fields:

- id
- upc
- title_id
- release_title
- edition
- format
- region
- studio
- distributor
- release_year
- release_date
- aspect_ratio
- disc_count
- packaging
- asin
- cover_image_url
- notes
- metadata_status
- created_at
- updated_at

Possible metadata_status values:

- unknown
- incomplete
- enriched
- verified
- needs_review

UPC should normally be unique per Physical Release.

---

## Inventory

Inventory represents copies of a Physical Release currently stored in a Tote.

Suggested fields:

- id
- tote_id
- physical_release_id
- quantity
- created_at
- updated_at

A Physical Release may exist in multiple Totes.

---

## Checkout

A Checkout represents inventory temporarily removed from available storage.

Suggested fields:

- id
- physical_release_id
- source_tote_id
- quantity
- checked_out_by
- destination
- notes
- checked_out_at
- checked_in_at
- return_tote_id
- status

Possible status values:

- checked_out
- returned

A returned DVD does not have to return to its original Tote.

---

## Inventory Transaction

Inventory Transactions form the audit history.

Suggested fields:

- id
- transaction_type
- physical_release_id
- tote_id
- quantity_delta
- checkout_id
- performed_by
- notes
- created_at

Possible transaction types:

- inventory_add
- inventory_remove
- checkout
- checkin
- transfer
- adjustment
- import

Inventory changes should generate transactions.

---

## Metadata Field Provenance

Metadata should retain information about where values came from.

Suggested fields:

- id
- physical_release_id
- title_id
- field_name
- source
- source_record_id
- source_value
- manually_verified
- observed_at

Example sources:

- barcode
- manual
- import
- upcmdb
- imdb
- tmdb
- wikidata
- other

---

## Enrichment Queue

Records with missing metadata can be enriched after inventory entry.

Suggested fields:

- id
- physical_release_id
- status
- attempts
- last_attempt_at
- next_attempt_at
- last_error
- created_at
- completed_at

Possible status values:

- pending
- processing
- completed
- partial
- failed

---

## Metadata merge rules

1. Human-verified data wins.

2. Enrichment may populate an empty field.

3. Enrichment must not silently overwrite a manually verified field.

4. Conflicting provider data should be flagged for review.

5. Provider failure must never prevent inventory entry.

6. Metadata lookup should check DVD Inventory's own catalog first.

7. External metadata should be cached after successful lookup.

8. A known UPC should normally require no future external lookup.

---

## Lookup pipeline

UPC
 |
 v
Local DVD Inventory catalog
 |
 +-- Found --> use cached metadata
 |
 +-- Missing
       |
       v
Physical-media metadata provider
       |
       +-- Found --> cache physical release
       |
       +-- Missing --> manual/incomplete record
                          |
                          v
                    enrichment queue

If a provider supplies an IMDb/TMDB/Wikidata identifier, richer title
metadata may subsequently be retrieved from an appropriate provider.

---

## Export scopes

DVD Inventory should support:

- All Inventory
- Selected Tote
- Selected Totes
- Current Search Results
- Selected Physical Releases
- Checked-Out Inventory
- Transaction History

Transaction History should support date filtering.

---

## Export formats

- CSV
- Excel XLSX
- PDF

UPCs must always be exported as text so spreadsheet software does not remove
leading zeroes or convert identifiers to scientific notation.

PDF exports are intended as printable human-readable reports.

CSV and XLSX exports are intended for data exchange, backup, and analysis.

---

## Scanning principle

Everywhere a barcode can be scanned, it can also be typed.

Everywhere it can be typed, it should also be scannable by phone camera when
camera scanning is available.

Hardware barcode scanners should work as keyboard-wedge input without
requiring a separate workflow.
