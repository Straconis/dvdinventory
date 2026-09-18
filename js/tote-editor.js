(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    const supabase = window.dvdSupabase;
    const dialog = document.getElementById("toteEditorDialog");
    const form = document.getElementById("toteEditorForm");
    const codeText = document.getElementById("toteEditorCode");
    const descriptionInput =
        document.getElementById("toteEditorDescription");
    const locationInput = document.getElementById("toteEditorLocation");
    const status = document.getElementById("toteEditorStatus");
    const cancelButton = document.getElementById("cancelToteEditorButton");
    const saveButton = document.getElementById("saveToteEditorButton");

    let targetTote = null;
    let savedCallback = null;
    let saving = false;

    function optionalText(value) {
        const normalized = String(value || "").trim();

        return normalized || null;
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

    function clearTarget() {
        targetTote = null;
        savedCallback = null;
    }

    function open(tote, onSaved) {
        targetTote = tote;
        savedCallback = typeof onSaved === "function" ? onSaved : null;
        codeText.textContent = tote.tote_code;
        descriptionInput.value = tote.description || "";
        locationInput.value = tote.physical_location || "";
        setStatus("");
        dialog.showModal();
        window.setTimeout(() => locationInput.focus(), 0);
    }

    async function save(event) {
        event.preventDefault();

        if (saving || !targetTote) {
            return;
        }

        saving = true;
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        setStatus("Saving tote location...", "info");

        try {
            const { data, error } = await supabase
                .from("totes")
                .update({
                    description: optionalText(descriptionInput.value),
                    physical_location: optionalText(locationInput.value)
                })
                .eq("id", targetTote.id)
                .select(
                    "id, tote_code, description, physical_location, notes"
                )
                .single();

            if (error) {
                throw error;
            }

            const callback = savedCallback;

            dialog.close();
            clearTarget();

            if (callback) {
                callback(data);
            }

            window.dispatchEvent(
                new CustomEvent("dvd-inventory-changed")
            );
        }
        catch (error) {
            console.error("Failed to update tote location:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not update the tote location.",
                "error"
            );
        }
        finally {
            saving = false;
            saveButton.disabled = false;
            saveButton.textContent = "Save Tote";
        }
    }

    cancelButton.addEventListener("click", () => {
        dialog.close();
        clearTarget();
    });

    dialog.addEventListener("cancel", clearTarget);
    form.addEventListener("submit", save);

    window.DVD_TOTE_EDITOR = Object.freeze({
        open
    });
})();
