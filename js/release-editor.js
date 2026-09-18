(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    const supabase = window.dvdSupabase;
    const dialog = document.getElementById("releaseEditorDialog");
    const form = document.getElementById("releaseEditorForm");
    const upcText = document.getElementById("releaseEditorUpc");
    const titleInput = document.getElementById("releaseEditorTitle");
    const editionInput = document.getElementById("releaseEditorEdition");
    const formatInput = document.getElementById("releaseEditorFormat");
    const yearInput = document.getElementById("releaseEditorYear");
    const studioInput = document.getElementById("releaseEditorStudio");
    const notesInput = document.getElementById("releaseEditorNotes");
    const status = document.getElementById("releaseEditorStatus");
    const cancelButton =
        document.getElementById("cancelReleaseEditorButton");
    const saveButton =
        document.getElementById("saveReleaseEditorButton");

    let targetRelease = null;
    let savedCallback = null;
    let saving = false;

    function getRelatedTitle(release) {
        if (!release || !release.titles) {
            return null;
        }

        return Array.isArray(release.titles)
            ? release.titles[0] || null
            : release.titles;
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

        status.classList.add(
            `workflow-status-${type || "info"}`
        );
    }

    function optionalValue(input) {
        const value = String(input.value || "").trim();

        return value || null;
    }

    function open(release, onSaved) {
        const relatedTitle = getRelatedTitle(release);

        targetRelease = release;
        savedCallback = typeof onSaved === "function"
            ? onSaved
            : null;
        upcText.textContent = `UPC ${release.upc}`;
        titleInput.value =
            release.release_title ||
            (relatedTitle && relatedTitle.title) ||
            "";
        editionInput.value = release.edition || "";
        formatInput.value = release.format || "DVD";
        yearInput.value = release.release_year || "";
        studioInput.value = release.studio || "";
        notesInput.value = release.notes || "";
        setStatus("");
        dialog.showModal();
        window.setTimeout(() => titleInput.focus(), 0);
    }

    async function save(event) {
        event.preventDefault();

        if (saving || !targetRelease) {
            return;
        }

        const releaseTitle = String(titleInput.value || "").trim();
        const yearValue = String(yearInput.value || "").trim();
        const releaseYear = yearValue ? Number(yearValue) : null;

        if (!releaseTitle) {
            setStatus("Enter the DVD title.", "error");
            titleInput.focus();
            return;
        }

        if (
            releaseYear !== null &&
            (
                !Number.isInteger(releaseYear) ||
                releaseYear < 1888 ||
                releaseYear > 2100
            )
        ) {
            setStatus("Enter a valid release year.", "error");
            yearInput.focus();
            return;
        }

        saving = true;
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        setStatus("Saving DVD information...", "info");

        try {
            const { data, error } = await supabase
                .from("physical_releases")
                .update({
                    release_title: releaseTitle,
                    edition: optionalValue(editionInput),
                    format: optionalValue(formatInput) || "DVD",
                    release_year: releaseYear,
                    studio: optionalValue(studioInput),
                    notes: optionalValue(notesInput),
                    metadata_status: "verified"
                })
                .eq("id", targetRelease.id)
                .select(
                    "id, upc, release_title, edition, format, release_year, studio, notes, metadata_status"
                )
                .single();

            if (error) {
                throw error;
            }

            const callback = savedCallback;

            dialog.close();
            targetRelease = null;
            savedCallback = null;

            if (callback) {
                callback(data);
            }
        }
        catch (error) {
            console.error("Failed to update DVD information:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not save the DVD information.",
                "error"
            );
        }
        finally {
            saving = false;
            saveButton.disabled = false;
            saveButton.textContent = "Save DVD Info";
        }
    }

    cancelButton.addEventListener("click", () => {
        dialog.close();
        targetRelease = null;
        savedCallback = null;
    });

    dialog.addEventListener("cancel", () => {
        targetRelease = null;
        savedCallback = null;
    });

    form.addEventListener("submit", save);

    window.DVD_RELEASE_EDITOR = Object.freeze({
        open
    });
})();
