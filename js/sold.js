(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    const supabase = window.dvdSupabase;
    const lookupForm = document.getElementById("soldLookupForm");
    const upcInput = document.getElementById("soldUpc");
    const lookupButton = document.getElementById("soldLookupButton");
    const status = document.getElementById("soldStatus");
    const details = document.getElementById("soldDetails");
    const releaseSummary =
        document.getElementById("soldReleaseSummary");
    const toteSelect = document.getElementById("soldTote");
    const quantityInput = document.getElementById("soldQuantity");
    const notesInput = document.getElementById("soldNotes");
    const submitButton =
        document.getElementById("soldSubmitButton");

    let currentRelease = null;
    let inventoryByToteId = new Map();
    let lookingUp = false;
    let recordingSale = false;

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

        status.classList.add(
            `workflow-status-${type || "info"}`
        );
    }

    function getRelatedRecord(value) {
        return Array.isArray(value)
            ? value[0] || null
            : value || null;
    }

    function getReleaseName(release) {
        const title = getRelatedRecord(release && release.titles);

        return (
            (title && title.title) ||
            (release && release.release_title) ||
            (release && release.upc
                ? `UPC ${release.upc}`
                : "Unknown DVD")
        );
    }

    function renderReleaseSummary(release) {
        releaseSummary.replaceChildren();

        const title = getRelatedRecord(release.titles);
        const heading = document.createElement("strong");
        const metadata = [];

        heading.className = "sold-release-title";
        heading.textContent = getReleaseName(release);

        if (
            release.release_title &&
            release.release_title !== heading.textContent
        ) {
            metadata.push(release.release_title);
        }

        if (release.edition) {
            metadata.push(release.edition);
        }

        if (release.format) {
            metadata.push(release.format);
        }

        const year = release.release_year || (title && title.year);

        if (year) {
            metadata.push(String(year));
        }

        metadata.push(`UPC ${release.upc}`);

        const detail = document.createElement("span");

        detail.className = "sold-release-metadata";
        detail.textContent = metadata.join(" | ");
        releaseSummary.append(heading, detail);
    }

    function updateQuantityLimit() {
        const inventory = inventoryByToteId.get(toteSelect.value);
        const available = inventory ? inventory.quantity : 1;

        quantityInput.max = String(available);

        if (
            Number(quantityInput.value) < 1 ||
            Number(quantityInput.value) > available
        ) {
            quantityInput.value = "1";
        }
    }

    function renderInventoryLocations(inventoryRows) {
        toteSelect.replaceChildren();
        inventoryByToteId = new Map();

        for (const inventory of inventoryRows) {
            const tote = getRelatedRecord(inventory.totes);

            if (!tote) {
                continue;
            }

            const key = String(tote.id);
            const option = document.createElement("option");
            const location = tote.physical_location
                ? ` - ${tote.physical_location}`
                : "";

            inventoryByToteId.set(key, inventory);
            option.value = key;
            option.textContent =
                `${tote.tote_code} (${inventory.quantity} available)` +
                location;
            toteSelect.appendChild(option);
        }

        updateQuantityLimit();
    }

    async function lookupRelease(options) {
        const settings = options || {};

        if (lookingUp) {
            return false;
        }

        const upc = String(upcInput.value || "").trim();

        if (!upc) {
            setStatus("Scan or enter a DVD UPC.", "error");
            upcInput.focus();
            return false;
        }

        lookingUp = true;
        lookupButton.disabled = true;
        currentRelease = null;
        details.classList.add("hidden");

        if (!settings.silent) {
            setStatus("Looking up DVD inventory...", "info");
        }

        try {
            const {
                data: release,
                error: releaseError
            } = await supabase
                .from("physical_releases")
                .select(
                    `
                    id,
                    upc,
                    release_title,
                    edition,
                    format,
                    release_year,
                    titles (
                        title,
                        year
                    )
                    `
                )
                .eq("upc", upc)
                .maybeSingle();

            if (releaseError) {
                throw releaseError;
            }

            if (!release) {
                setStatus(
                    `No DVD release was found for UPC ${upc}.`,
                    "error"
                );
                return false;
            }

            const {
                data: inventoryRows,
                error: inventoryError
            } = await supabase
                .from("inventory")
                .select(
                    `
                    id,
                    tote_id,
                    quantity,
                    totes (
                        id,
                        tote_code,
                        description,
                        physical_location
                    )
                    `
                )
                .eq("physical_release_id", release.id)
                .gt("quantity", 0)
                .order("tote_id", {
                    ascending: true
                });

            if (inventoryError) {
                throw inventoryError;
            }

            if (!inventoryRows || inventoryRows.length === 0) {
                setStatus(
                    `${getReleaseName(release)} has no available copies in inventory.`,
                    "error"
                );
                return false;
            }

            currentRelease = release;
            renderReleaseSummary(release);
            renderInventoryLocations(inventoryRows);
            details.classList.remove("hidden");

            if (!settings.silent) {
                setStatus(
                    `Found ${getReleaseName(release)}.`,
                    "success"
                );
            }

            return true;
        }
        catch (error) {
            console.error("Failed to find sold DVD inventory:", error);
            setStatus(
                "Could not look up that DVD. Check the UPC and try again.",
                "error"
            );
            return false;
        }
        finally {
            lookingUp = false;
            lookupButton.disabled = false;
        }
    }

    async function recordSoldDvd() {
        if (recordingSale || !currentRelease) {
            return;
        }

        const inventory = inventoryByToteId.get(toteSelect.value);
        const quantity = Number(quantityInput.value);

        if (
            !inventory ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > inventory.quantity
        ) {
            setStatus(
                "Choose a valid tote and quantity to remove.",
                "error"
            );
            return;
        }

        const tote = getRelatedRecord(inventory.totes);
        const title = getReleaseName(currentRelease);
        const confirmed = window.confirm(
            `Record ${quantity} sold ${quantity === 1 ? "copy" : "copies"} ` +
            `of ${title} from ${tote.tote_code}?\n\n` +
            "This permanently reduces available inventory. " +
            "The transaction history will be preserved."
        );

        if (!confirmed) {
            return;
        }

        recordingSale = true;
        submitButton.disabled = true;
        submitButton.textContent = "Recording...";

        const optionalNotes = String(notesInput.value || "").trim();
        const transactionNotes = optionalNotes
            ? `Sold. ${optionalNotes}`
            : "Sold.";

        try {
            const { error } = await supabase.rpc(
                "inventory_remove",
                {
                    p_tote_id: tote.id,
                    p_physical_release_id: currentRelease.id,
                    p_quantity: quantity,
                    p_notes: transactionNotes
                }
            );

            if (error) {
                throw error;
            }

            notesInput.value = "";
            await lookupRelease({
                silent: true
            });
            setStatus(
                `Recorded ${quantity} sold ${quantity === 1 ? "copy" : "copies"} ` +
                `of ${title} from ${tote.tote_code}.`,
                "success"
            );

            window.dispatchEvent(
                new CustomEvent("dvd-inventory-changed")
            );
        }
        catch (error) {
            console.error("Failed to record sold DVD:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not record the sold DVD.",
                "error"
            );
        }
        finally {
            recordingSale = false;
            submitButton.disabled = false;
            submitButton.textContent = "Record Sold DVD";
        }
    }

    if (lookupForm) {
        lookupForm.addEventListener("submit", (event) => {
            event.preventDefault();
            lookupRelease();
        });
    }

    if (toteSelect) {
        toteSelect.addEventListener("change", updateQuantityLimit);
    }

    if (submitButton) {
        submitButton.addEventListener("click", recordSoldDvd);
    }
})();
