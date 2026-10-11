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

    const coverPreview = document.getElementById("releaseEditorCoverPreview");
    const coverInputs = [document.getElementById("releaseEditorCoverUpload"), document.getElementById("releaseEditorCoverCamera")];
    let coverFile = null;
    let previewUrl = null;

    function resetCover(url) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        coverFile = null;
        coverInputs.forEach(input => { input.value = ""; });
        coverPreview.removeAttribute("src");
        coverPreview.classList.add("hidden");
        if (url && /^https?:\/\//i.test(url)) {
            coverPreview.src = url;
            coverPreview.classList.remove("hidden");
        }
    }

    coverInputs.forEach(input => input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file || saving) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
            setStatus("Choose a JPEG, PNG, or WebP image up to 10 MB.", "error");
            input.value = "";
            return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        coverFile = file;
        previewUrl = URL.createObjectURL(file);
        coverPreview.src = previewUrl;
        coverPreview.classList.remove("hidden");
        setStatus("New cover selected. Save DVD Info to keep it.", "info");
    }));

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
        upcText.textContent = /^NO-UPC-/i.test(String(release.upc || ""))
            ? "No UPC"
            : `UPC ${release.upc}`;
        titleInput.value =
            release.release_title ||
            (relatedTitle && relatedTitle.title) ||
            "";
        editionInput.value = release.edition || "";
        formatInput.value = release.format || "DVD";
        yearInput.value = release.release_year || "";
        studioInput.value = release.studio || "";
        notesInput.value = release.notes || "";
        resetCover(release.cover_image_url);
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

        let uploadedPath = null;
        let coverUrl = null;
        coverInputs.forEach(input => { input.disabled = true; });
        cancelButton.disabled = true;
        try {
            if (coverFile) {
                const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[coverFile.type];
                const path = `${targetRelease.id}/${crypto.randomUUID()}.${extension}`;
                const { error: uploadError } = await supabase.storage.from("dvd-covers").upload(path, coverFile, { contentType: coverFile.type, upsert: false });
                if (uploadError) throw uploadError;
                uploadedPath = path;
                coverUrl = supabase.storage.from("dvd-covers").getPublicUrl(path).data.publicUrl;
            }
            const { data, error } = await supabase
                .from("physical_releases")
                .update({
                    release_title: releaseTitle,
                    edition: optionalValue(editionInput),
                    format: optionalValue(formatInput) || "DVD",
                    release_year: releaseYear,
                    studio: optionalValue(studioInput),
                    notes: optionalValue(notesInput),
                    metadata_status: "verified",
                    ...(coverUrl ? { cover_image_url: coverUrl } : {})
                })
                .eq("id", targetRelease.id)
                .select(
                    "id, upc, release_title, edition, format, release_year, studio, notes, cover_image_url, metadata_status"
                )
                .single();

            if (error) {
                throw error;
            }

            uploadedPath = null;
            resetCover(null);
            const callback = savedCallback;

            dialog.close();
            targetRelease = null;
            savedCallback = null;

            if (callback) {
                callback(data);
            }

            window.dispatchEvent(
                new CustomEvent("dvd-inventory-changed")
            );
        }
        catch (error) {
            if (uploadedPath) {
                try {
                    await supabase.storage.from("dvd-covers").remove([uploadedPath]);
                } catch (cleanupError) {
                    console.error("Could not clean up cover upload:", cleanupError);
                }
            }
            console.error("Failed to update DVD information:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not save the DVD information.",
                "error"
            );
        }
        finally {
            coverInputs.forEach(input => { input.disabled = false; });
            cancelButton.disabled = false;
            saving = false;
            saveButton.disabled = false;
            saveButton.textContent = "Save DVD Info";
        }
    }

    cancelButton.addEventListener("click", () => {
        if (saving) return;
        resetCover(null);
        dialog.close();
        targetRelease = null;
        savedCallback = null;
    });

    dialog.addEventListener("cancel", event => {
        if (saving) { event.preventDefault(); return; }
        resetCover(null);
        targetRelease = null;
        savedCallback = null;
    });

    form.addEventListener("submit", save);

    window.DVD_RELEASE_EDITOR = Object.freeze({
        open
    });
})();
