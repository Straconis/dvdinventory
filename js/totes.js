(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    if (!window.DVD_BARCODES) {
        throw new Error(
            "DVD Inventory barcode tools were not initialized."
        );
    }

    const supabase = window.dvdSupabase;
    const barcodes = window.DVD_BARCODES;

    const toteCodeInput =
        document.getElementById("newToteCode");

    const toteDescriptionInput =
        document.getElementById("newToteDescription");

    const toteLocationInput =
        document.getElementById("newToteLocation");

    const createToteButton =
        document.getElementById("createToteButton");

    const refreshTotesButton =
        document.getElementById("refreshTotesButton");

    const toteStatus =
        document.getElementById("toteStatus");

    const toteList =
        document.getElementById("toteList");

    const archivedTotePanel =
        document.getElementById("archivedTotePanel");

    const archivedToteList =
        document.getElementById("archivedToteList");

    let loadingTotes = false;
    let creatingTote = false;
    const deletingToteIds = new Set();
    const archivingToteIds = new Set();

    function normalizeOptionalText(value) {
        const normalized = String(value || "").trim();

        return normalized || null;
    }

    function normalizeToteCode(value) {
        const raw = String(value || "")
            .trim()
            .toUpperCase();

        if (!raw) {
            return "";
        }

        let digits = null;

        if (/^\d{1,5}$/.test(raw)) {
            digits = raw;
        }
        else {
            const match = raw.match(/^TOTE-(\d{1,5})$/);

            if (match) {
                digits = match[1];
            }
        }

        if (digits === null) {
            return "";
        }

        return `TOTE-${digits.padStart(5, "0")}`;
    }

    function setStatus(message, type) {
        if (!toteStatus) {
            return;
        }

        toteStatus.textContent = message || "";

        toteStatus.classList.remove(
            "hidden",
            "tote-status-success",
            "tote-status-error",
            "tote-status-info"
        );

        if (!message) {
            toteStatus.classList.add("hidden");
            return;
        }

        toteStatus.classList.add(
            `tote-status-${type || "info"}`
        );
    }

    function createTextElement(tagName, className, text) {
        const element = document.createElement(tagName);

        if (className) {
            element.className = className;
        }

        element.textContent = text;

        return element;
    }

    function createActionButton(label, className, handler) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = [
            "tote-action-button",
            className || ""
        ].filter(Boolean).join(" ");
        button.textContent = label;
        button.addEventListener("click", handler);

        return button;
    }

    function getRelatedTitle(release) {
        if (!release || !release.titles) {
            return null;
        }

        return Array.isArray(release.titles)
            ? release.titles[0] || null
            : release.titles;
    }

    function renderToteContents(panel, inventoryRows) {
        panel.replaceChildren();

        if (!Array.isArray(inventoryRows) || inventoryRows.length === 0) {
            panel.appendChild(
                createTextElement(
                    "p",
                    "tote-contents-empty",
                    "No DVDs are currently stored in this tote."
                )
            );
            return;
        }

        const table = document.createElement("table");
        const tableHead = document.createElement("thead");
        const headingRow = document.createElement("tr");
        const titleHeading = createTextElement("th", "", "DVD");
        const quantityHeading = createTextElement(
            "th",
            "tote-quantity-heading",
            "Quantity"
        );

        titleHeading.scope = "col";
        quantityHeading.scope = "col";
        headingRow.append(titleHeading, quantityHeading);
        tableHead.appendChild(headingRow);

        const tableBody = document.createElement("tbody");

        for (const inventoryRow of inventoryRows) {
            const release = inventoryRow.physical_releases || {};
            const relatedTitle = getRelatedTitle(release);
            const displayTitle =
                release.release_title ||
                (relatedTitle && relatedTitle.title) ||
                (release.upc ? `UPC ${release.upc}` : "Unknown DVD");
            const details = [];

            if (
                release.release_title &&
                release.release_title !== displayTitle
            ) {
                details.push(release.release_title);
            }

            if (release.edition) {
                details.push(release.edition);
            }

            if (release.format) {
                details.push(release.format);
            }

            const year =
                release.release_year ||
                (relatedTitle && relatedTitle.year);

            if (year) {
                details.push(String(year));
            }

            if (release.upc) {
                details.push(`UPC ${release.upc}`);
            }

            const row = document.createElement("tr");
            const titleCell = document.createElement("td");
            const quantityCell = createTextElement(
                "td",
                "tote-quantity",
                String(inventoryRow.quantity)
            );

            titleCell.appendChild(
                createTextElement(
                    "strong",
                    "tote-release-title",
                    displayTitle
                )
            );

            if (details.length > 0) {
                titleCell.appendChild(
                    createTextElement(
                        "span",
                        "tote-release-details",
                        details.join(" | ")
                    )
                );
            }

            if (
                window.DVD_RELEASE_EDITOR &&
                typeof window.DVD_RELEASE_EDITOR.open === "function"
            ) {
                titleCell.appendChild(
                    createActionButton(
                        "Edit DVD Info",
                        "tote-release-edit",
                        () => {
                            window.DVD_RELEASE_EDITOR.open(
                                release,
                                (updatedRelease) => {
                                    inventoryRow.physical_releases =
                                        Object.assign(
                                            {},
                                            release,
                                            updatedRelease
                                        );
                                    renderToteContents(
                                        panel,
                                        inventoryRows
                                    );
                                    setStatus(
                                        `Updated DVD info for UPC ${updatedRelease.upc}.`,
                                        "success"
                                    );
                                }
                            );
                        }
                    )
                );
            }

            row.append(titleCell, quantityCell);
            tableBody.appendChild(row);
        }

        table.className = "tote-contents-table";
        table.append(tableHead, tableBody);
        panel.appendChild(table);
    }

    async function toggleToteContents(tote, panel, button) {
        if (!panel.hidden) {
            panel.hidden = true;
            button.textContent = "View Contents";
            button.setAttribute("aria-expanded", "false");
            return;
        }

        panel.hidden = false;
        button.textContent = "Hide Contents";
        button.setAttribute("aria-expanded", "true");

        if (panel.dataset.loaded === "true") {
            return;
        }

        button.disabled = true;
        panel.replaceChildren(
            createTextElement(
                "p",
                "tote-contents-empty",
                "Loading tote contents..."
            )
        );

        try {
            const { data, error } = await supabase
                .from("inventory")
                .select(
                    `
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
                        metadata_status,
                        titles (
                            title,
                            year
                        )
                    )
                    `
                )
                .eq("tote_id", tote.id)
                .gt("quantity", 0)
                .order("id", {
                    ascending: true
                });

            if (error) {
                throw error;
            }

            renderToteContents(panel, data || []);
            panel.dataset.loaded = "true";
        }
        catch (error) {
            console.error("Failed to load tote contents:", error);
            panel.replaceChildren(
                createTextElement(
                    "p",
                    "tote-contents-error",
                    "Could not load this tote's contents. Try again."
                )
            );
            setStatus(
                `Could not load contents for ${tote.tote_code}.`,
                "error"
            );
        }
        finally {
            button.disabled = false;
        }
    }

    function printToteLabel(tote) {
        try {
            const toteCode =
                normalizeToteCode(tote.tote_code) || tote.tote_code;

            barcodes.printCode128Label(toteCode);
        }
        catch (error) {
            console.error("Failed to print tote label:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not open the tote label for printing.",
                "error"
            );
        }
    }

    function saveToteBarcode(tote) {
        try {
            const toteCode =
                normalizeToteCode(tote.tote_code) || tote.tote_code;

            barcodes.downloadCode128Label(
                toteCode,
                `${toteCode}-barcode.png`
            );
            setStatus(
                `Saved the ${toteCode} barcode image.`,
                "success"
            );
        }
        catch (error) {
            console.error("Failed to save tote barcode:", error);
            setStatus(
                "Could not save the tote barcode image.",
                "error"
            );
        }
    }

    async function deleteTote(tote, button) {
        if (deletingToteIds.has(tote.id)) {
            return;
        }

        const confirmed = window.confirm(
            `Delete ${tote.tote_code}?\n\n` +
            "Only empty, unused totes can be deleted. " +
            "Totes with inventory or history will be blocked."
        );

        if (!confirmed) {
            return;
        }

        deletingToteIds.add(tote.id);
        button.disabled = true;
        button.textContent = "Deleting...";

        try {
            setStatus(`Deleting ${tote.tote_code}...`, "info");

            const { error } = await supabase.rpc(
                "delete_empty_tote",
                {
                    p_tote_id: tote.id
                }
            );

            if (error) {
                throw error;
            }

            setStatus(
                `${tote.tote_code} was deleted.`,
                "success"
            );
            await loadTotes({
                silent: true
            });
        }
        catch (error) {
            console.error("Failed to delete tote:", error);

            const message = String(
                error && error.message ? error.message : ""
            ).toLowerCase();
            const isReferenced = [
                "inventory",
                "checkout",
                "transaction",
                "referenced",
                "foreign key"
            ].some((term) => message.includes(term));

            setStatus(
                isReferenced
                    ? `${tote.tote_code} cannot be deleted because it has inventory or history.`
                    : `Could not delete ${tote.tote_code}. Try again.`,
                "error"
            );
        }
        finally {
            deletingToteIds.delete(tote.id);
            button.disabled = false;
            button.textContent = "Delete Tote";
        }
    }

    async function setToteArchived(tote, archived, button) {
        if (archivingToteIds.has(tote.id)) {
            return;
        }

        if (archived) {
            const confirmed = window.confirm(
                `Archive ${tote.tote_code}?\n\n` +
                "It will be removed from active tote choices, but its " +
                "inventory and transaction history will be preserved. " +
                "The tote must not contain any DVDs."
            );

            if (!confirmed) {
                return;
            }
        }

        archivingToteIds.add(tote.id);
        button.disabled = true;
        button.textContent = archived ? "Archiving..." : "Restoring...";

        try {
            setStatus(
                `${archived ? "Archiving" : "Restoring"} ` +
                    `${tote.tote_code}...`,
                "info"
            );

            const { error } = await supabase.rpc(
                "set_tote_archived",
                {
                    p_tote_id: tote.id,
                    p_archived: archived
                }
            );

            if (error) {
                throw error;
            }

            setStatus(
                `${tote.tote_code} was ` +
                    `${archived ? "archived" : "restored"}.`,
                "success"
            );
            await loadTotes({
                silent: true
            });
            window.dispatchEvent(
                new CustomEvent("dvd-totes-changed")
            );
        }
        catch (error) {
            console.error("Failed to update tote archive status:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : `Could not ${archived ? "archive" : "restore"} the tote.`,
                "error"
            );
        }
        finally {
            archivingToteIds.delete(tote.id);
            button.disabled = false;
            button.textContent = archived ? "Archive Tote" : "Restore Tote";
        }
    }

    function renderToteCard(tote) {
        const card = document.createElement("article");
        const heading = document.createElement("div");

        card.className = "tote-item";
        heading.className = "tote-item-heading";
        heading.appendChild(
            createTextElement(
                "strong",
                "tote-item-code",
                tote.tote_code
            )
        );
        card.appendChild(heading);

        if (tote.description) {
            card.appendChild(
                createTextElement(
                    "p",
                    "tote-item-description",
                    tote.description
                )
            );
        }

        const locationText = tote.physical_location
            ? `Location: ${tote.physical_location}`
            : "Location: Not specified";

        card.appendChild(
            createTextElement(
                "p",
                "tote-item-location",
                locationText
            )
        );

        const actions = document.createElement("div");
        const contentsPanel = document.createElement("div");
        const contentsId = `tote-contents-${tote.id}`;
        let contentsButton;

        actions.className = "tote-actions";
        contentsPanel.className = "tote-contents";
        contentsPanel.id = contentsId;
        contentsPanel.hidden = true;

        contentsButton = createActionButton(
            "View Contents",
            "",
            () => {
                toggleToteContents(
                    tote,
                    contentsPanel,
                    contentsButton
                );
            }
        );
        contentsButton.setAttribute("aria-expanded", "false");
        contentsButton.setAttribute("aria-controls", contentsId);

        actions.append(
            contentsButton,
            createActionButton("Print Label", "", () => {
                printToteLabel(tote);
            }),
            createActionButton("Save Barcode", "", () => {
                saveToteBarcode(tote);
            })
        );

        let archiveButton;

        archiveButton = createActionButton(
            "Archive Tote",
            "",
            () => {
                setToteArchived(tote, true, archiveButton);
            }
        );
        actions.appendChild(archiveButton);

        let deleteButton;

        deleteButton = createActionButton(
            "Delete Tote",
            "tote-action-danger",
            () => {
                deleteTote(tote, deleteButton);
            }
        );
        actions.appendChild(deleteButton);

        card.append(actions, contentsPanel);

        return card;
    }

    function renderArchivedToteCard(tote) {
        const card = document.createElement("article");
        const archivedDate = tote.archived_at
            ? new Date(tote.archived_at).toLocaleDateString()
            : "Unknown date";

        card.className = "tote-item tote-item-archived";
        card.appendChild(
            createTextElement(
                "strong",
                "tote-item-code",
                tote.tote_code
            )
        );

        if (tote.description) {
            card.appendChild(
                createTextElement(
                    "p",
                    "tote-item-description",
                    tote.description
                )
            );
        }

        card.appendChild(
            createTextElement(
                "p",
                "tote-item-location",
                tote.physical_location
                    ? `Location: ${tote.physical_location}`
                    : "Location: Not specified"
            )
        );
        card.appendChild(
            createTextElement(
                "p",
                "tote-archived-date",
                `Archived ${archivedDate}`
            )
        );

        const actions = document.createElement("div");
        let restoreButton;

        actions.className = "tote-actions";
        restoreButton = createActionButton(
            "Restore Tote",
            "",
            () => {
                setToteArchived(tote, false, restoreButton);
            }
        );
        actions.appendChild(restoreButton);
        card.appendChild(actions);

        return card;
    }

    function renderTotes(totes) {
        if (!toteList) {
            return;
        }

        const activeTotes = (totes || []).filter(
            (tote) => !tote.archived_at
        );
        const archivedTotes = (totes || []).filter(
            (tote) => Boolean(tote.archived_at)
        );

        toteList.replaceChildren();
        archivedToteList.replaceChildren();
        archivedTotePanel.classList.toggle(
            "hidden",
            archivedTotes.length === 0
        );

        if (activeTotes.length === 0) {
            toteList.appendChild(
                createTextElement(
                    "p",
                    "tote-empty-state",
                    archivedTotes.length > 0
                        ? "No active totes. Restore an archived tote or create a new one."
                        : "No totes have been created yet."
                )
            );
        }
        else for (const tote of activeTotes) {
            toteList.appendChild(renderToteCard(tote));
        }

        for (const tote of archivedTotes) {
            archivedToteList.appendChild(
                renderArchivedToteCard(tote)
            );
        }
    }

    async function hasAuthenticatedSession() {
        const {
            data,
            error
        } = await supabase.auth.getSession();

        if (error) {
            throw error;
        }

        return Boolean(data && data.session);
    }

    async function loadTotes(options) {
        const settings = options || {};

        if (loadingTotes) {
            return;
        }

        loadingTotes = true;

        if (refreshTotesButton) {
            refreshTotesButton.disabled = true;
        }

        try {
            const authenticated =
                await hasAuthenticatedSession();

            if (!authenticated) {
                renderTotes([]);

                if (!settings.silent) {
                    setStatus(
                        "Sign in to load totes.",
                        "info"
                    );
                }

                return;
            }

            if (!settings.silent) {
                setStatus(
                    "Loading totes...",
                    "info"
                );
            }

            const {
                data,
                error
            } = await supabase
                .from("totes")
                .select(
                    "id, tote_code, description, physical_location, archived_at, archived_by, created_at, updated_at"
                )
                .order("tote_code", {
                    ascending: true
                });

            if (error) {
                throw error;
            }

            renderTotes(data || []);

            if (!settings.silent) {
                const count =
                    Array.isArray(data)
                        ? data.length
                        : 0;

                setStatus(
                    count === 1
                        ? "Loaded 1 tote."
                        : `Loaded ${count} totes.`,
                    "success"
                );
            }
        }
        catch (error) {
            console.error(
                "Failed to load totes:",
                error
            );

            setStatus(
                "Could not load totes. Check your session and try again.",
                "error"
            );
        }
        finally {
            loadingTotes = false;

            if (refreshTotesButton) {
                refreshTotesButton.disabled = false;
            }
        }
    }

    async function createTote() {
        if (creatingTote) {
            return;
        }

        const toteCode =
            normalizeToteCode(
                toteCodeInput
                    ? toteCodeInput.value
                    : ""
            );

        if (!toteCode) {
            setStatus(
                "Enter a tote number or code such as 42 or TOTE-00042.",
                "error"
            );

            if (toteCodeInput) {
                toteCodeInput.focus();
            }

            return;
        }

        if (toteCodeInput) {
            toteCodeInput.value = toteCode;
        }

        const description =
            normalizeOptionalText(
                toteDescriptionInput
                    ? toteDescriptionInput.value
                    : ""
            );

        const physicalLocation =
            normalizeOptionalText(
                toteLocationInput
                    ? toteLocationInput.value
                    : ""
            );

        creatingTote = true;

        if (createToteButton) {
            createToteButton.disabled = true;
            createToteButton.textContent = "Creating...";
        }

        try {
            const authenticated =
                await hasAuthenticatedSession();

            if (!authenticated) {
                throw new Error(
                    "An authenticated session is required."
                );
            }

            setStatus(
                `Creating ${toteCode}...`,
                "info"
            );

            const {
                data,
                error
            } = await supabase
                .from("totes")
                .insert({
                    tote_code: toteCode,
                    description,
                    physical_location: physicalLocation
                })
                .select(
                    "id, tote_code, description, physical_location, archived_at, archived_by, created_at, updated_at"
                )
                .single();

            if (error) {
                throw error;
            }

            if (toteDescriptionInput) {
                toteDescriptionInput.value = "";
            }

            if (toteLocationInput) {
                toteLocationInput.value = "";
            }

            setStatus(
                `${data.tote_code} created successfully.`,
                "success"
            );

            await loadTotes({
                silent: true
            });

            if (toteCodeInput) {
                toteCodeInput.value = "";
                toteCodeInput.focus();
            }
        }
        catch (error) {
            console.error(
                "Failed to create tote:",
                error
            );

            const message =
                String(
                    error &&
                    error.message
                        ? error.message
                        : ""
                ).toLowerCase();

            const code =
                String(
                    error &&
                    error.code
                        ? error.code
                        : ""
                );

            if (
                code === "23505" ||
                message.includes("duplicate") ||
                message.includes("unique")
            ) {
                setStatus(
                    `${toteCode} already exists. Restore it if it is archived.`,
                    "error"
                );
            }
            else {
                setStatus(
                    "Could not create the tote. Check the entered information and try again.",
                    "error"
                );
            }
        }
        finally {
            creatingTote = false;

            if (createToteButton) {
                createToteButton.disabled = false;
                createToteButton.textContent = "Create Tote";
            }
        }
    }

    if (createToteButton) {
        createToteButton.addEventListener(
            "click",
            () => {
                createTote();
            }
        );
    }

    if (refreshTotesButton) {
        refreshTotesButton.addEventListener(
            "click",
            () => {
                loadTotes();
            }
        );
    }

    if (toteCodeInput) {
        toteCodeInput.addEventListener(
            "keydown",
            (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    createTote();
                }
            }
        );

        toteCodeInput.addEventListener(
            "blur",
            () => {
                const normalized =
                    normalizeToteCode(
                        toteCodeInput.value
                    );

                if (normalized) {
                    toteCodeInput.value = normalized;
                }
            }
        );
    }

    supabase.auth.onAuthStateChange(
        (event, session) => {
            if (event === "SIGNED_OUT") {
                renderTotes([]);
                setStatus("", "info");
                return;
            }

            if (
                session &&
                (
                    event === "SIGNED_IN" ||
                    event === "INITIAL_SESSION"
                )
            ) {
                window.setTimeout(
                    () => {
                        loadTotes({
                            silent: true
                        });
                    },
                    0
                );
            }
        }
    );

    window.addEventListener(
        "DOMContentLoaded",
        () => {
            loadTotes({
                silent: true
            });
        }
    );

    window.DVD_TOTES = Object.freeze({
        load: loadTotes,
        normalizeCode: normalizeToteCode
    });
})();
