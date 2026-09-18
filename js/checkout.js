(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    const supabase = window.dvdSupabase;
    const form = document.getElementById("checkoutForm");
    const toteInput = document.getElementById("checkoutTote");
    const upcInput = document.getElementById("checkoutUpc");
    const personInput = document.getElementById("checkoutPerson");
    const destinationInput = document.getElementById("checkoutDestination");
    const quantityInput = document.getElementById("checkoutQuantity");
    const notesInput = document.getElementById("checkoutNotes");
    const submitButton = document.getElementById("checkoutSubmitButton");
    const status = document.getElementById("checkoutStatus");

    let checkingOut = false;
    let selectedReleaseId = null;
    let selectedToteId = null;

    function optionalText(value) {
        const normalized = String(value || "").trim();

        return normalized || null;
    }

    function normalizeUpc(value) {
        const compactValue = String(value || "").replace(/\s+/g, "");

        if (/^0\d{12}$/.test(compactValue)) {
            return compactValue.substring(1);
        }

        return compactValue;
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

        status.classList.add(`workflow-status-${type || "info"}`);
    }

    async function resolveIds(toteCode, upc) {
        if (selectedToteId && selectedReleaseId) {
            return {
                toteId: selectedToteId,
                releaseId: selectedReleaseId
            };
        }

        const [toteResult, releaseResult] = await Promise.all([
            supabase
                .from("totes")
                .select("id")
                .eq("tote_code", toteCode)
                .is("archived_at", null)
                .maybeSingle(),
            supabase
                .from("physical_releases")
                .select("id")
                .eq("upc", upc)
                .maybeSingle()
        ]);

        if (toteResult.error) {
            throw toteResult.error;
        }

        if (releaseResult.error) {
            throw releaseResult.error;
        }

        if (!toteResult.data) {
            throw new Error(`Tote ${toteCode} was not found.`);
        }

        if (!releaseResult.data) {
            throw new Error(`UPC ${upc} was not found.`);
        }

        return {
            toteId: toteResult.data.id,
            releaseId: releaseResult.data.id
        };
    }

    async function checkOut(event) {
        event.preventDefault();

        if (checkingOut) {
            return;
        }

        const toteCode = normalizeToteCode(toteInput.value);
        const upc = normalizeUpc(upcInput.value);
        const quantity = Number(quantityInput.value);

        toteInput.value = toteCode;
        upcInput.value = upc;

        if (!toteCode) {
            setStatus("Scan or enter a valid source tote.", "error");
            toteInput.focus();
            return;
        }

        if (!/^\d{8,14}$/.test(upc)) {
            setStatus("Scan or enter a valid DVD UPC.", "error");
            upcInput.focus();
            return;
        }

        if (!Number.isInteger(quantity) || quantity < 1) {
            setStatus("Enter a valid checkout quantity.", "error");
            quantityInput.focus();
            return;
        }

        checkingOut = true;
        submitButton.disabled = true;
        submitButton.textContent = "Checking Out...";
        setStatus("Checking DVD out...", "info");

        try {
            const ids = await resolveIds(toteCode, upc);
            const { error } = await supabase.rpc(
                "checkout_inventory",
                {
                    p_source_tote_id: ids.toteId,
                    p_physical_release_id: ids.releaseId,
                    p_quantity: quantity,
                    p_checked_out_to: optionalText(personInput.value),
                    p_destination: optionalText(destinationInput.value),
                    p_notes: optionalText(notesInput.value)
                }
            );

            if (error) {
                throw error;
            }

            setStatus(
                `Checked out ${quantity} ${quantity === 1 ? "copy" : "copies"} ` +
                    `of UPC ${upc} from ${toteCode}.`,
                "success"
            );
            upcInput.value = "";
            personInput.value = "";
            destinationInput.value = "";
            notesInput.value = "";
            quantityInput.value = "1";
            selectedReleaseId = null;
            selectedToteId = null;

            window.dispatchEvent(
                new CustomEvent("dvd-inventory-changed")
            );
        }
        catch (error) {
            console.error("Failed to check out DVD:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not check out the DVD.",
                "error"
            );
        }
        finally {
            checkingOut = false;
            submitButton.disabled = false;
            submitButton.textContent = "Check Out DVD";
        }
    }

    function resetResolvedIds() {
        selectedReleaseId = null;
        selectedToteId = null;
    }

    toteInput.addEventListener("input", resetResolvedIds);
    upcInput.addEventListener("input", resetResolvedIds);
    form.addEventListener("submit", checkOut);

    window.DVD_CHECKOUT = Object.freeze({
        open(release, tote) {
            selectedReleaseId = release.id;
            selectedToteId = tote.id;
            toteInput.value = tote.tote_code;
            upcInput.value = release.upc;
            quantityInput.value = "1";
            setStatus("");

            if (
                window.DVD_APP &&
                typeof window.DVD_APP.showPage === "function"
            ) {
                window.DVD_APP.showPage("checkout");
            }

            window.setTimeout(() => personInput.focus(), 0);
        }
    });
})();
