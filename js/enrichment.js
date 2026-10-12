(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    const supabase = window.dvdSupabase;
    const refreshButton =
        document.getElementById("refreshEnrichmentButton");
    const status = document.getElementById("enrichmentStatus");
    const list = document.getElementById("enrichmentList");
    let currentProfile = null;
    let loading = false;

    function isAdmin() {
        return Boolean(
            currentProfile &&
            currentProfile.active &&
            currentProfile.role === "admin"
        );
    }

    function setStatus(message, type) {
        if (!status) {
            return;
        }

        status.textContent = message || "";
        status.classList.remove(
            "hidden",
            "workflow-status-success",
            "workflow-status-error",
            "workflow-status-info"
        );

        if (!message) {
            status.classList.add("hidden");
            return;
        }

        status.classList.add(`workflow-status-${type || "info"}`);
    }

    function createTextElement(tagName, className, text) {
        const element = document.createElement(tagName);

        if (className) {
            element.className = className;
        }

        element.textContent = text;
        return element;
    }

    async function readFunctionError(error) {
        if (error && error.context) {
            try {
                const body = await error.context.json();

                if (body && (body.message || body.error)) {
                    return body.message || body.error;
                }
            }
            catch (parseError) {
                console.warn(
                    "Could not read enrichment error response:",
                    parseError
                );
            }
        }

        return error && error.message
            ? error.message
            : "DVD information lookup failed.";
    }

    async function lookupRelease(physicalReleaseId, options) {
        const settings = options || {};

        try {
            const { data, error } = await supabase.functions.invoke(
                "enrich-upc",
                {
                    body: {
                        physicalReleaseId,
                        force: settings.force === true
                    }
                }
            );

            if (error) {
                throw error;
            }

            if (data && data.status === "completed") {
                window.dispatchEvent(
                    new CustomEvent("dvd-inventory-changed")
                );
            }

            if (isAdmin()) {
                loadQueue({ silent: true });
            }

            return data || {
                status: "failed",
                message: "The lookup returned no result."
            };
        }
        catch (error) {
            const message = await readFunctionError(error);

            console.error("DVD information lookup failed:", error);

            if (isAdmin()) {
                loadQueue({ silent: true });
            }

            return {
                status: "failed",
                message
            };
        }
    }

    function renderQueue(rows) {
        list.replaceChildren();

        if (!rows.length) {
            list.appendChild(
                createTextElement(
                    "p",
                    "user-empty-state",
                    "No UPC lookups are waiting for review."
                )
            );
            return;
        }

        rows.forEach((row) => {
            const release = row.physical_releases || {};
            const container = createTextElement(
                "div",
                "enrichment-row",
                ""
            );
            const identity = createTextElement(
                "div",
                "enrichment-identity",
                ""
            );
            const state = createTextElement(
                "div",
                "enrichment-state",
                row.status || "pending"
            );
            const title = release.release_title ||
                `UPC ${release.upc || "Unknown"}`;

            identity.appendChild(
                createTextElement("strong", "enrichment-title", title)
            );
            identity.appendChild(
                createTextElement(
                    "span",
                    "enrichment-upc",
                    `UPC ${release.upc || "Unknown"}`
                )
            );

            if (row.last_error) {
                identity.appendChild(
                    createTextElement(
                        "span",
                        "enrichment-error",
                        row.last_error
                    )
                );
            }

            state.appendChild(
                createTextElement(
                    "span",
                    "enrichment-detail",
                    `${Number(row.attempts || 0)} attempt${Number(row.attempts || 0) === 1 ? "" : "s"}`
                )
            );

            const retryButton = createTextElement(
                "button",
                "secondary-button",
                "Retry Lookup"
            );

            retryButton.type = "button";
            retryButton.disabled = row.status === "processing";
            retryButton.addEventListener("click", async () => {
                retryButton.disabled = true;
                retryButton.textContent = "Looking up...";
                setStatus(
                    `Looking up UPC ${release.upc || ""}...`,
                    "info"
                );

                const result = await lookupRelease(release.id, {
                    force: true
                });

                if (result.status === "completed") {
                    setStatus(result.message, "success");
                }
                else {
                    setStatus(
                        result.message || "The lookup did not find DVD information.",
                        "error"
                    );
                }

                await loadQueue({ silent: true });
            });

            container.append(identity, state, retryButton);
            list.appendChild(container);
        });
    }

    async function loadQueue(options) {
        const settings = options || {};

        if (!list || !isAdmin() || loading) {
            return;
        }

        loading = true;
        refreshButton.disabled = true;

        if (!settings.silent) {
            setStatus("Loading UPC lookup activity...", "info");
        }

        try {
            const { data, error } = await supabase
                .from("enrichment_queue")
                .select(
                    "id, status, attempts, last_error, created_at, last_attempt_at, completed_at, physical_releases(id, upc, release_title, metadata_status)"
                )
                .order("created_at", { ascending: false })
                .limit(100);

            if (error) {
                throw error;
            }

            renderQueue(data || []);

            if (!settings.silent) {
                setStatus("", "info");
            }
        }
        catch (error) {
            console.error("Failed to load UPC enrichment queue:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not load UPC lookup activity.",
                "error"
            );
        }
        finally {
            loading = false;
            refreshButton.disabled = false;
        }
    }

    const scanButton = document.getElementById("scanMissingCoversButton");
    const stopButton = document.getElementById("stopCoverScanButton");
    const scanStatus = document.getElementById("coverScanStatus");
    let scanning = false;
    let stopRequested = false;

    async function pauseScan(seconds, message) {
        for (let remaining = seconds; remaining > 0 && !stopRequested && isAdmin(); remaining--) {
            scanStatus.textContent = `${message} Continuing automatically in ${remaining}s...`;
            await new Promise(resolve => window.setTimeout(resolve, 1000));
        }
    }

    // A slow or throttled provider should not require another button click.
    async function lookupCoverWithRetry(release, progress) {
        for (let attempt = 0; !stopRequested && isAdmin(); attempt++) {
            scanStatus.textContent = `Looking up ${release.release_title || release.upc}... ${progress()}`;
            let result, lookupError;
            try {
                const response = await supabase.functions.invoke("enrich-upc", {
                    body: { physicalReleaseId: release.id, coverOnly: true }
                });
                result = response.data;
                lookupError = response.error;
            } catch (error) {
                lookupError = error;
            }
            if (result?.status === "configuration_required") throw new Error(result.message);
            if (!lookupError && result?.status !== "rate_limited" && result?.status !== "failed") return result;
            const statusCode = Number(lookupError?.context?.status || 0);
            const message = lookupError ? await readFunctionError(lookupError) : result?.message || "Cover lookup temporarily unavailable.";
            if ([401, 403].includes(statusCode)) throw new Error(message);
            if (statusCode >= 400 && statusCode < 500 && ![408, 429].includes(statusCode)) {
                return { status: "failed", message };
            }
            const throttled = result?.status === "rate_limited" || statusCode === 429;
            // Continue waiting for provider quotas; cap retries for other errors so one DVD cannot block the library.
            if (!throttled && attempt >= 3) return { status: "failed", message };
            const retryAfter = Number(lookupError?.context?.headers?.get?.("Retry-After"));
            const seconds = throttled
                ? Math.max(30, Math.min(900, retryAfter || 30 * Math.pow(2, Math.min(attempt, 5))))
                : 5 * Math.pow(2, Math.min(attempt, 3));
            await pauseScan(seconds, `${message} ${progress()}`);
        }
        return null;
    }

    async function scanMissingCovers() {
        if (!isAdmin() || scanning) return;
        scanning = true;
        stopRequested = false;
        scanButton.disabled = true;
        stopButton.disabled = false;
        stopButton.classList.remove("hidden");
        scanStatus.classList.remove("hidden", "workflow-status-error");
        scanStatus.classList.add("workflow-status-info");
        let checked = 0, added = 0, unavailable = 0, failed = 0, skipped = 0;
        let lastId = 0;
        let ending = "Scan complete.";
        let librarySummary = "";
        const progress = () => `${librarySummary}${checked} checked; ${added} covers added; ${unavailable} unavailable; ${skipped} skipped; ${failed} failed.`;
        try {
            scanStatus.textContent = "Checking which titles need cover art...";
            const [allReleases, missingCovers] = await Promise.all([
                supabase.from("physical_releases").select("id", { count: "exact", head: true }),
                supabase.from("physical_releases").select("id", { count: "exact", head: true })
                    .or("cover_image_url.is.null,cover_image_url.eq.")
            ]);
            if (allReleases.error) throw allReleases.error;
            if (missingCovers.error) throw missingCovers.error;
            const total = Number(allReleases.count || 0);
            const missing = Number(missingCovers.count || 0);
            librarySummary = `Library: ${total} DVD titles. ${Math.max(0, total - missing)} already had cover art and did not need a lookup. ${missing} were missing cover art. `;
            // Keyset pagination avoids skipping records as successful updates remove missing covers.
            while (!stopRequested && isAdmin()) {
                scanStatus.textContent = `Finding missing covers... ${progress()}`;
                const { data, error } = await supabase.from("physical_releases")
                    .select("id, upc, release_title")
                    .or("cover_image_url.is.null,cover_image_url.eq.")
                    .gt("id", lastId)
                    .order("id", { ascending: true })
                    .limit(100);
                if (error) throw error;
                if (!data || !data.length) break;
                for (const release of data) {
                    if (stopRequested || !isAdmin()) break;
                    lastId = release.id;
                    const result = await lookupCoverWithRetry(release, progress);
                    if (!result || stopRequested || !isAdmin()) break;
                    checked++;
                    if (result?.status === "completed") added++;
                    else if (result?.status === "not_found") unavailable++;
                    else if (result?.status === "skipped") skipped++;
                    else failed++;
                }
            }
            if (ending === "Scan complete." && (stopRequested || !isAdmin())) ending = "Scan stopped.";
            scanStatus.textContent = `${ending} ${progress()}${unavailable ? ` For ${unavailable} titles, no artwork was available or the movie match was ambiguous. These need a refined title or manual cover upload.` : ""}`;
        } catch (error) {
            scanStatus.classList.remove("workflow-status-info");
            scanStatus.classList.add("workflow-status-error");
            scanStatus.textContent = `Scan stopped: ${error.message || "Cover lookup failed."} ${progress()}`;
        } finally {
            scanning = false;
            scanButton.disabled = false;
            stopButton.classList.add("hidden");
            if (added) window.dispatchEvent(new CustomEvent("dvd-inventory-changed"));
        }
    }

    if (scanButton) scanButton.addEventListener("click", scanMissingCovers);
    if (stopButton) stopButton.addEventListener("click", () => {
        stopRequested = true;
        stopButton.disabled = true;
        scanStatus.textContent = "Stopping scan...";
    });

    function initializeForProfile(profile) {
        currentProfile = profile || null;

        if (isAdmin()) {
            loadQueue({ silent: true });
        }
    }

    window.addEventListener("dvd-auth-ready", (event) => {
        initializeForProfile(event.detail && event.detail.profile);
    });

    window.addEventListener("DOMContentLoaded", () => {
        if (window.DVD_AUTH && window.DVD_AUTH.isAuthenticated()) {
            initializeForProfile(window.DVD_AUTH.getProfile());
        }
    });

    if (refreshButton) {
        refreshButton.addEventListener("click", () => loadQueue());
    }

    window.DVD_ENRICHMENT = Object.freeze({
        lookupRelease,
        load: loadQueue
    });
})();
