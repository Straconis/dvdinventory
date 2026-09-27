(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    const supabase = window.dvdSupabase;
    const form = document.getElementById("addDvdForm");
    const toteInput = document.getElementById("addToteCode");
    const upcInput = document.getElementById("addUpc");
    const toggleNoUpcButton =
        document.getElementById("toggleNoUpcButton");
    const manualFields = document.getElementById("manualDvdFields");
    const manualTitleInput = document.getElementById("manualDvdTitle");
    const manualEditionInput =
        document.getElementById("manualDvdEdition");
    const submitButton = document.getElementById("addDvdButton");
    const status = document.getElementById("addDvdStatus");
    const statusText = document.getElementById("addDvdStatusText");
    const editAddedDvdButton =
        document.getElementById("editAddedDvdButton");

    let addingDvd = false;
    let noUpcMode = false;
    let lastAddedRelease = null;

    function setStatus(message, type) {
        statusText.textContent = message || "";
        lastAddedRelease = null;
        editAddedDvdButton.classList.add("hidden");
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

    function offerEdit(release) {
        if (!release || !release.id) {
            return;
        }

        lastAddedRelease = release;
        editAddedDvdButton.classList.remove("hidden");
    }

    async function loadRelease(releaseId) {
        if (!releaseId) {
            return null;
        }

        const { data, error } = await supabase
            .from("physical_releases")
            .select(
                "id, upc, release_title, edition, format, release_year, studio, notes, metadata_status"
            )
            .eq("id", releaseId)
            .single();

        if (error) {
            console.warn("Could not load the newly added DVD:", error);
            return null;
        }

        return data;
    }

    function normalizeToteCode(value) {
        if (
            window.DVD_TOTES &&
            typeof window.DVD_TOTES.normalizeCode === "function"
        ) {
            return window.DVD_TOTES.normalizeCode(value);
        }

        return String(value || "").trim().toUpperCase();
    }

    function normalizeUpc(value) {
        const compactValue = String(value || "")
            .replace(/\s+/g, "");

        if (/^0\d{12}$/.test(compactValue)) {
            return compactValue.substring(1);
        }

        return compactValue;
    }

    function setNoUpcMode(enabled) {
        noUpcMode = Boolean(enabled);
        manualFields.classList.toggle("hidden", !noUpcMode);
        upcInput.required = !noUpcMode;
        manualTitleInput.required = noUpcMode;
        toggleNoUpcButton.textContent = noUpcMode
            ? "Use UPC Instead"
            : "Add DVD Without UPC";
        submitButton.textContent = noUpcMode
            ? "Add DVD Without UPC"
            : "Add DVD";

        if (noUpcMode) {
            upcInput.value = "";
            manualTitleInput.focus();
        }
        else {
            manualTitleInput.value = "";
            manualEditionInput.value = "";
            upcInput.focus();
        }
    }

    async function addDvd(event) {
        event.preventDefault();

        if (addingDvd) {
            return;
        }

        const toteCode = normalizeToteCode(toteInput.value);
        const upc = normalizeUpc(upcInput.value);
        const manualTitle = String(manualTitleInput.value || "").trim();
        const manualEdition =
            String(manualEditionInput.value || "").trim();

        toteInput.value = toteCode;

        if (!noUpcMode) {
            upcInput.value = upc;
        }

        if (!toteCode) {
            setStatus("Scan or enter a tote code.", "error");
            toteInput.focus();
            return;
        }

        if (noUpcMode && !manualTitle) {
            setStatus("Enter the DVD title.", "error");
            manualTitleInput.focus();
            return;
        }

        if (!noUpcMode && !/^(?:\d{8}|\d{12,14})$/.test(upc)) {
            setStatus(
                "Enter an 8, 12, 13, or 14-digit barcode. Include the small digits at both ends of a UPC.",
                "error"
            );
            upcInput.focus();
            return;
        }

        addingDvd = true;
        submitButton.disabled = true;
        submitButton.textContent = "Adding...";
        setStatus("Adding DVD to inventory...", "info");

        try {
            const { data, error } = noUpcMode
                ? await supabase.rpc(
                    "add_inventory_without_upc",
                    {
                        p_tote_code: toteCode,
                        p_release_title: manualTitle,
                        p_edition: manualEdition || null,
                        p_quantity: 1,
                        p_notes: "Manual no-UPC add through Add DVDs."
                    }
                )
                : await supabase.rpc(
                    "add_inventory_by_codes",
                    {
                        p_tote_code: toteCode,
                        p_upc: upc,
                        p_quantity: 1,
                        p_notes: "Added through Add DVDs."
                    }
                );

            if (error) {
                throw error;
            }

            window.dispatchEvent(
                new CustomEvent("dvd-inventory-changed")
            );

            const inventoryRecord = Array.isArray(data) ? data[0] : data;
            const releaseId = inventoryRecord &&
                inventoryRecord.physical_release_id;
            let lookupResult = null;

            if (
                !noUpcMode &&
                releaseId &&
                window.DVD_ENRICHMENT &&
                typeof window.DVD_ENRICHMENT.lookupRelease === "function"
            ) {
                setStatus(
                    `Added UPC ${upc}. Looking up DVD information...`,
                    "info"
                );
                lookupResult = await window.DVD_ENRICHMENT.lookupRelease(
                    releaseId
                );
            }

            upcInput.value = "";
            manualTitleInput.value = "";
            manualEditionInput.value = "";

            if (noUpcMode) {
                setStatus(
                    `Added ${manualTitle} to ${toteCode}. Scan or enter the next DVD.`,
                    "success"
                );
            }
            else if (lookupResult && lookupResult.status === "completed") {
                const title = lookupResult.release &&
                    lookupResult.release.release_title;

                setStatus(
                    `Added ${title || `UPC ${upc}`} to ${toteCode}. Scan the next DVD.`,
                    "success"
                );
            }
            else if (lookupResult && lookupResult.status === "not_found") {
                setStatus(
                    `Added UPC ${upc} to ${toteCode}. No title was found; use Edit DVD Info or retry it from Users.`,
                    "success"
                );
            }
            else if (lookupResult && lookupResult.status === "failed") {
                setStatus(
                    `Added UPC ${upc} to ${toteCode}. The information lookup is queued for administrator review.`,
                    "success"
                );
            }
            else {
                setStatus(
                    `Added UPC ${upc} to ${toteCode}. Scan the next DVD.`,
                    "success"
                );
            }

            offerEdit(await loadRelease(releaseId));

            if (noUpcMode) {
                manualTitleInput.focus();
            }
            else {
                upcInput.focus();
            }
        }
        catch (error) {
            console.error("Failed to add DVD:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not add the DVD.",
                "error"
            );
        }
        finally {
            addingDvd = false;
            submitButton.disabled = false;
            submitButton.textContent = noUpcMode
                ? "Add DVD Without UPC"
                : "Add DVD";
        }
    }

    if (toggleNoUpcButton) {
        toggleNoUpcButton.addEventListener("click", () => {
            setNoUpcMode(!noUpcMode);
        });
    }

    if (editAddedDvdButton) {
        editAddedDvdButton.addEventListener("click", () => {
            if (
                !lastAddedRelease ||
                !window.DVD_RELEASE_EDITOR ||
                typeof window.DVD_RELEASE_EDITOR.open !== "function"
            ) {
                return;
            }

            window.DVD_RELEASE_EDITOR.open(
                lastAddedRelease,
                (updatedRelease) => {
                    setStatus(
                        `Updated ${updatedRelease.release_title}. Scan or enter the next DVD.`,
                        "success"
                    );
                    offerEdit(updatedRelease);
                }
            );
        });
    }

    if (form) {
        form.addEventListener("submit", addDvd);
    }
})();
