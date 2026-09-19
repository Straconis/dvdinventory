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
