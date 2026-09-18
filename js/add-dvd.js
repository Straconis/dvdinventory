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
    const submitButton = document.getElementById("addDvdButton");
    const status = document.getElementById("addDvdStatus");

    let addingDvd = false;

    function setStatus(message, type) {
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

    async function addDvd(event) {
        event.preventDefault();

        if (addingDvd) {
            return;
        }

        const toteCode = normalizeToteCode(toteInput.value);
        const upc = normalizeUpc(upcInput.value);

        toteInput.value = toteCode;
        upcInput.value = upc;

        if (!toteCode) {
            setStatus("Scan or enter a tote code.", "error");
            toteInput.focus();
            return;
        }

        if (!/^\d{8,14}$/.test(upc)) {
            setStatus(
                "Enter a valid 8- to 14-digit DVD barcode.",
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
            const { error } = await supabase.rpc(
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

            upcInput.value = "";
            setStatus(
                `Added UPC ${upc} to ${toteCode}. Scan the next DVD.`,
                "success"
            );
            upcInput.focus();

            window.dispatchEvent(
                new CustomEvent("dvd-inventory-changed")
            );
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
            submitButton.textContent = "Add DVD";
        }
    }

    if (form) {
        form.addEventListener("submit", addDvd);
    }
})();
