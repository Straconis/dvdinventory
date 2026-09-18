-- DVD Inventory
-- Migration 003: security hardening
--
-- Tighten column privileges for direct authenticated writes and
-- preserve checkout references in inventory transaction history.

begin;

-- ============================================================
-- TOTES
-- ============================================================
-- Keep SELECT table-wide.
-- INSERT may supply business fields only.

revoke insert on table public.totes from authenticated;

grant insert (
    tote_code,
    description,
    physical_location,
    notes
)
on table public.totes
to authenticated;


-- ============================================================
-- TITLES
-- ============================================================
-- INSERT may supply business/catalog fields only.

revoke insert on table public.titles from authenticated;

grant insert (
    title,
    original_title,
    year,
    imdb_id,
    tmdb_id,
    wikidata_id,
    runtime_minutes,
    genres,
    director,
    plot,
    poster_url
)
on table public.titles
to authenticated;


-- ============================================================
-- PHYSICAL RELEASES
-- ============================================================
-- UPC remains TEXT.
-- INSERT may supply release/catalog fields only.

revoke insert on table public.physical_releases from authenticated;

grant insert (
    upc,
    title_id,
    release_title,
    edition,
    format,
    region,
    studio,
    distributor,
    release_year,
    release_date,
    aspect_ratio,
    disc_count,
    packaging,
    asin,
    cover_image_url,
    notes,
    metadata_status
)
on table public.physical_releases
to authenticated;


-- ============================================================
-- METADATA PROVENANCE
-- ============================================================
-- Existing RLS continues to require administrator access.
-- Prevent direct control of the identity column.

revoke insert, update on table public.metadata_provenance
from authenticated;

grant insert (
    physical_release_id,
    title_id,
    field_name,
    source,
    source_record_id,
    source_value,
    manually_verified,
    observed_at
)
on table public.metadata_provenance
to authenticated;

grant update (
    physical_release_id,
    title_id,
    field_name,
    source,
    source_record_id,
    source_value,
    manually_verified,
    observed_at
)
on table public.metadata_provenance
to authenticated;


-- ============================================================
-- ENRICHMENT QUEUE
-- ============================================================
-- Existing RLS continues to require administrator access.
-- physical_release_id is intentionally immutable after creation.

revoke insert, update on table public.enrichment_queue
from authenticated;

grant insert (
    physical_release_id,
    status,
    attempts,
    last_attempt_at,
    next_attempt_at,
    last_error,
    completed_at
)
on table public.enrichment_queue
to authenticated;

grant update (
    status,
    attempts,
    last_attempt_at,
    next_attempt_at,
    last_error,
    completed_at
)
on table public.enrichment_queue
to authenticated;


-- ============================================================
-- AUDIT INTEGRITY
-- ============================================================
-- A transaction-history row should retain its checkout reference.
-- Prevent deletion of a referenced checkout rather than silently
-- nulling inventory_transactions.checkout_id.

alter table public.inventory_transactions
    drop constraint if exists inventory_transactions_checkout_id_fkey;

alter table public.inventory_transactions
    add constraint inventory_transactions_checkout_id_fkey
    foreign key (checkout_id)
    references public.checkouts(id)
    on delete restrict;


commit;
