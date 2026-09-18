(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    const supabase = window.dvdSupabase;
    const inventoryList = document.getElementById("inventoryList");
    const inventorySummary = document.getElementById("inventorySummary");
    const inventoryStatus = document.getElementById("inventoryStatus");
    const refreshButton = document.getElementById("refreshInventoryButton");
    const searchInput = document.getElementById("searchInput");
    const searchResults = document.getElementById("searchResults");
    const searchStatus = document.getElementById("searchStatus");

    let releases = [];
    let loading = false;
    let authenticated = false;
    let searchTimer = null;

    function relatedRecord(value) {
        if (Array.isArray(value)) {
            return value[0] || null;
        }

        return value || null;
    }

    function textElement(tagName, className, text) {
        const element = document.createElement(tagName);

        if (className) {
            element.className = className;
        }

        element.textContent = text;

        return element;
    }

    function actionButton(label, className, handler) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = [
            "inventory-action-button",
            className || ""
        ].filter(Boolean).join(" ");
        button.textContent = label;
        button.addEventListener("click", handler);

        return button;
    }

    function setStatus(element, message, type) {
        if (!element) {
            return;
        }

        element.textContent = message || "";
        element.classList.remove(
            "hidden",
            "workflow-status-success",
            "workflow-status-error",
            "workflow-status-info"
        );

        if (!message) {
            element.classList.add("hidden");
            return;
        }

        element.classList.add(`workflow-status-${type || "info"}`);
    }

    function releaseName(release) {
        const title = relatedRecord(release.titles);

        return release.release_title ||
            (title && title.title) ||
            `UPC ${release.upc}`;
    }

    function releaseDetails(release) {
        const title = relatedRecord(release.titles);
        const details = [];

        if (release.edition) {
            details.push(release.edition);
        }

        if (release.format) {
            details.push(release.format);
        }

        const year = release.release_year || (title && title.year);

        if (year) {
            details.push(String(year));
        }

        if (release.studio) {
            details.push(release.studio);
        }

        return details.join(" | ");
    }

    function groupInventory(rows) {
        const grouped = new Map();

        for (const row of rows || []) {
            const release = relatedRecord(row.physical_releases);
            const tote = relatedRecord(row.totes);

            if (!release || !tote || Number(row.quantity) <= 0) {
                continue;
            }

            let item = grouped.get(String(release.id));

            if (!item) {
                item = {
                    release,
                    quantity: 0,
                    locations: []
                };
                grouped.set(String(release.id), item);
            }

            item.quantity += Number(row.quantity);
            item.locations.push({
                tote,
                quantity: Number(row.quantity)
            });
        }

        return Array.from(grouped.values()).sort((left, right) =>
            releaseName(left.release).localeCompare(
                releaseName(right.release),
                undefined,
                {
                    sensitivity: "base",
                    numeric: true
                }
            )
        );
    }

    function searchableText(item) {
        const release = item.release;
        const title = relatedRecord(release.titles);
        const locationText = item.locations.map(({ tote }) => [
            tote.tote_code,
            tote.description,
            tote.physical_location
        ].filter(Boolean).join(" ")).join(" ");

        return [
            releaseName(release),
            release.upc,
            release.edition,
            release.format,
            release.release_year,
            release.studio,
            release.notes,
            title && title.original_title,
            title && title.year,
            locationText
        ].filter(Boolean).join(" ").toLocaleLowerCase();
    }

    function createHeader() {
        const header = document.createElement("div");

        header.className = "inventory-result-header";
        header.append(
            textElement("span", "", "DVD"),
            textElement("span", "", "UPC"),
            textElement("span", "", "Tote Locations"),
            textElement("span", "inventory-result-quantity", "Quantity")
        );

        return header;
    }

    function createResultRow(item) {
        const row = document.createElement("article");
        const releaseCell = document.createElement("div");
        const upcCell = document.createElement("div");
        const locationsCell = document.createElement("div");
        const details = releaseDetails(item.release);

        row.className = "inventory-result-row";
        releaseCell.appendChild(
            textElement(
                "strong",
                "inventory-result-title",
                releaseName(item.release)
            )
        );

        if (details) {
            releaseCell.appendChild(
                textElement("span", "inventory-result-details", details)
            );
        }

        if (
            window.DVD_RELEASE_EDITOR &&
            typeof window.DVD_RELEASE_EDITOR.open === "function"
        ) {
            const releaseActions = document.createElement("div");

            releaseActions.className = "inventory-result-actions";
            releaseActions.appendChild(
                actionButton("Edit DVD Info", "", () => {
                    window.DVD_RELEASE_EDITOR.open(
                        item.release,
                        (updatedRelease) => {
                            item.release = Object.assign(
                                {},
                                item.release,
                                updatedRelease
                            );
                            renderInventory();
                            renderSearch();
                        }
                    );
                })
            );
            releaseCell.appendChild(releaseActions);
        }

        upcCell.className = "inventory-result-upc-cell";
        upcCell.appendChild(
            textElement("span", "inventory-result-upc", item.release.upc)
        );

        locationsCell.className = "inventory-result-locations";

        for (const location of item.locations) {
            const locationElement = document.createElement("div");
            const tote = location.tote;
            const detailParts = [];

            locationElement.className = "inventory-location";
            locationElement.appendChild(
                textElement(
                    "span",
                    "inventory-location-code",
                    `${tote.tote_code} (${location.quantity})`
                )
            );

            if (tote.description) {
                detailParts.push(tote.description);
            }

            if (tote.physical_location) {
                detailParts.push(tote.physical_location);
            }

            if (detailParts.length > 0) {
                locationElement.appendChild(
                    textElement(
                        "span",
                        "inventory-location-detail",
                        detailParts.join(" | ")
                    )
                );
            }

            const locationActions = document.createElement("div");

            locationActions.className = "inventory-location-actions";

            if (
                window.DVD_TOTE_EDITOR &&
                typeof window.DVD_TOTE_EDITOR.open === "function"
            ) {
                locationActions.appendChild(
                    actionButton("Edit Tote Location", "", () => {
                        window.DVD_TOTE_EDITOR.open(
                            tote,
                            (updatedTote) => {
                                Object.assign(tote, updatedTote);
                                renderInventory();
                                renderSearch();
                            }
                        );
                    })
                );
            }

            if (
                window.DVD_CHECKOUT &&
                typeof window.DVD_CHECKOUT.open === "function"
            ) {
                locationActions.appendChild(
                    actionButton("Check Out", "", () => {
                        window.DVD_CHECKOUT.open(item.release, tote);
                    })
                );
            }

            if (
                window.DVD_SOLD &&
                typeof window.DVD_SOLD.open === "function"
            ) {
                locationActions.appendChild(
                    actionButton(
                        "Remove",
                        "inventory-action-danger",
                        () => {
                            window.DVD_SOLD.open(item.release.upc, tote.id);
                        }
                    )
                );
            }

            locationElement.appendChild(locationActions);

            locationsCell.appendChild(locationElement);
        }

        row.append(
            releaseCell,
            upcCell,
            locationsCell,
            textElement(
                "div",
                "inventory-result-quantity",
                String(item.quantity)
            )
        );

        return row;
    }

    function renderResults(container, items, emptyMessage) {
        container.replaceChildren();

        if (items.length === 0) {
            container.appendChild(
                textElement("p", "inventory-empty-state", emptyMessage)
            );
            return;
        }

        container.appendChild(createHeader());

        for (const item of items) {
            container.appendChild(createResultRow(item));
        }
    }

    function renderInventory() {
        const totalCopies = releases.reduce(
            (sum, item) => sum + item.quantity,
            0
        );
        const releaseWord = releases.length === 1 ? "release" : "releases";
        const copyWord = totalCopies === 1 ? "copy" : "copies";

        inventorySummary.textContent =
            `${releases.length} ${releaseWord} | ` +
            `${totalCopies} available ${copyWord}`;
        renderResults(
            inventoryList,
            releases,
            "No DVDs are currently available in inventory."
        );
    }

    function renderSearch() {
        const query = String(searchInput.value || "")
            .trim()
            .toLocaleLowerCase();

        setStatus(searchStatus, "");

        if (!query) {
            renderResults(
                searchResults,
                [],
                "Enter a title, edition, UPC, or tote to search inventory."
            );
            return;
        }

        const terms = query.split(/\s+/).filter(Boolean);
        const matches = releases.filter((item) => {
            const haystack = searchableText(item);

            return terms.every((term) => haystack.includes(term));
        });

        renderResults(
            searchResults,
            matches,
            `No available inventory matches "${String(searchInput.value).trim()}".`
        );

        setStatus(
            searchStatus,
            `${matches.length} matching ` +
                `${matches.length === 1 ? "release" : "releases"}.`,
            "info"
        );
    }

    async function loadInventory() {
        if (!authenticated || loading) {
            return;
        }

        loading = true;
        refreshButton.disabled = true;
        refreshButton.textContent = "Refreshing...";
        inventorySummary.textContent = "Loading inventory...";
        setStatus(inventoryStatus, "Loading inventory...", "info");

        try {
            const { data, error } = await supabase
                .from("inventory")
                .select(`
                    id,
                    quantity,
                    physical_releases (
                        id,
                        upc,
                        release_title,
                        edition,
                        format,
                        release_year,
                        studio,
                        notes,
                        titles (
                            title,
                            original_title,
                            year
                        )
                    ),
                    totes (
                        id,
                        tote_code,
                        description,
                        physical_location
                    )
                `)
                .gt("quantity", 0)
                .order("id", {
                    ascending: true
                });

            if (error) {
                throw error;
            }

            releases = groupInventory(data || []);
            setStatus(inventoryStatus, "");
            renderInventory();
            renderSearch();
        }
        catch (error) {
            console.error("Failed to load inventory:", error);
            releases = [];
            inventorySummary.textContent = "Inventory unavailable";
            inventoryList.replaceChildren(
                textElement(
                    "p",
                    "inventory-empty-state",
                    "Could not load inventory. Try Refresh."
                )
            );
            setStatus(
                inventoryStatus,
                error && error.message
                    ? error.message
                    : "Could not load inventory.",
                "error"
            );
            setStatus(
                searchStatus,
                "Search is unavailable because inventory could not be loaded.",
                "error"
            );
        }
        finally {
            loading = false;
            refreshButton.disabled = false;
            refreshButton.textContent = "Refresh";
        }
    }

    window.addEventListener("dvd-auth-ready", () => {
        authenticated = true;
        loadInventory();
    });

    window.addEventListener("dvd-inventory-changed", loadInventory);

    refreshButton.addEventListener("click", loadInventory);

    searchInput.addEventListener("input", () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(renderSearch, 120);
    });
})();
