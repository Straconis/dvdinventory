(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    const supabase = window.dvdSupabase;
    const scopeInputs = document.querySelectorAll(
        'input[name="exportScope"]'
    );
    const toteOptions = document.getElementById("exportToteOptions");
    const historyOptions = document.getElementById("exportHistoryOptions");
    const toteInput = document.getElementById("exportTote");
    const toteList = document.getElementById("exportToteList");
    const startDateInput = document.getElementById("exportStartDate");
    const endDateInput = document.getElementById("exportEndDate");
    const fieldInputs = document.querySelectorAll("[data-export-field]");
    const formatButtons = document.querySelectorAll("[data-export-format]");
    const exportButton = document.getElementById("exportButton");
    const summaryTitle = document.getElementById("exportSummaryTitle");
    const summaryText = document.getElementById("exportSummaryText");
    const status = document.getElementById("exportStatus");
    const searchInput = document.getElementById("searchInput");

    const fields = {
        upc: "UPC",
        title: "Title",
        edition: "Edition",
        format: "Format",
        year: "Year",
        tote: "Tote",
        quantity: "Quantity",
        available_quantity: "Available Quantity",
        imdb_id: "IMDb ID",
        checkout_information: "Checkout Information",
        notes: "Notes",
        metadata_status: "Metadata Status",
        transaction_date: "Transaction / Checkout Date",
        transaction_type: "Transaction Type"
    };

    let selectedFormat = "csv";
    let exporting = false;
    let authenticated = false;

    function relation(value) {
        return Array.isArray(value) ? value[0] || null : value || null;
    }

    function selectedScope() {
        const input = document.querySelector(
            'input[name="exportScope"]:checked'
        );

        return input ? input.value : "all";
    }

    function selectedFields(scope) {
        const keys = Array.from(fieldInputs)
            .filter((input) => input.checked)
            .map((input) => input.dataset.exportField);

        if (scope === "history") {
            for (const key of ["transaction_date", "transaction_type"]) {
                if (!keys.includes(key)) {
                    keys.push(key);
                }
            }
        }

        if (scope === "checkout" && !keys.includes("transaction_date")) {
            keys.push("transaction_date");
        }

        return keys;
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

    function normalizeToteCode(value) {
        if (
            window.DVD_TOTES &&
            typeof window.DVD_TOTES.normalizeCode === "function"
        ) {
            return window.DVD_TOTES.normalizeCode(value);
        }

        return String(value || "").trim().toUpperCase();
    }

    function titleForRelease(release) {
        const title = relation(release && release.titles);

        return (release && release.release_title) ||
            (title && title.title) ||
            (release && release.upc ? `UPC ${release.upc}` : "Unknown DVD");
    }

    function releaseValues(release) {
        const title = relation(release && release.titles);

        return {
            upc: release && release.upc ? release.upc : "",
            title: titleForRelease(release),
            edition: release && release.edition ? release.edition : "",
            format: release && release.format ? release.format : "",
            year: release && (release.release_year || (title && title.year))
                ? release.release_year || title.year
                : "",
            imdb_id: title && title.imdb_id ? title.imdb_id : "",
            notes: release && release.notes ? release.notes : "",
            metadata_status: release && release.metadata_status
                ? release.metadata_status
                : ""
        };
    }

    function formatDate(value) {
        if (!value) {
            return "";
        }

        return new Date(value).toLocaleString();
    }

    function inventoryQuery() {
        return supabase
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
                    notes,
                    metadata_status,
                    titles (
                        title,
                        year,
                        imdb_id
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
    }

    function searchableInventoryText(row) {
        const release = relation(row.physical_releases);
        const title = relation(release && release.titles);
        const tote = relation(row.totes);

        return [
            titleForRelease(release),
            release && release.upc,
            release && release.edition,
            release && release.format,
            release && release.release_year,
            release && release.notes,
            title && title.year,
            tote && tote.tote_code,
            tote && tote.description,
            tote && tote.physical_location
        ].filter(Boolean).join(" ").toLocaleLowerCase();
    }

    function parseToteCodes(scope) {
        if (scope !== "tote" && scope !== "totes") {
            return [];
        }

        const rawCodes = String(toteInput.value || "")
            .split(/[\s,;]+/)
            .filter(Boolean);
        const codes = rawCodes.map(normalizeToteCode);

        if (codes.length === 0 || codes.some((code) => !code)) {
            throw new Error("Enter a valid tote code for this export.");
        }

        if (scope === "tote" && codes.length !== 1) {
            throw new Error("Selected Tote requires exactly one tote code.");
        }

        return Array.from(new Set(codes));
    }

    async function loadInventory(scope) {
        const { data, error } = await inventoryQuery();

        if (error) {
            throw error;
        }

        let rows = data || [];

        if (scope === "tote" || scope === "totes") {
            const toteCodes = parseToteCodes(scope);

            rows = rows.filter((row) => {
                const tote = relation(row.totes);

                return tote && toteCodes.includes(tote.tote_code);
            });
        }

        if (scope === "search") {
            const query = String(searchInput.value || "")
                .trim()
                .toLocaleLowerCase();

            if (!query) {
                throw new Error(
                    "Enter a search on the Search page before exporting results."
                );
            }

            const terms = query.split(/\s+/).filter(Boolean);

            rows = rows.filter((row) => {
                const text = searchableInventoryText(row);

                return terms.every((term) => text.includes(term));
            });
        }

        return rows.map((row) => {
            const release = relation(row.physical_releases);
            const tote = relation(row.totes);

            return Object.assign(releaseValues(release), {
                tote: tote ? tote.tote_code : "",
                quantity: row.quantity,
                available_quantity: row.quantity,
                checkout_information: "",
                transaction_date: "",
                transaction_type: ""
            });
        });
    }

    async function loadCheckouts() {
        const { data, error } = await supabase
            .from("checkouts")
            .select(`
                id,
                quantity,
                checked_out_to,
                destination,
                notes,
                checked_out_at,
                physical_releases (
                    upc,
                    release_title,
                    edition,
                    format,
                    release_year,
                    notes,
                    metadata_status,
                    titles (
                        title,
                        year,
                        imdb_id
                    )
                ),
                source_tote:totes!checkouts_source_tote_id_fkey (
                    tote_code
                )
            `)
            .eq("status", "checked_out")
            .order("checked_out_at", {
                ascending: false
            });

        if (error) {
            throw error;
        }

        return (data || []).map((checkout) => {
            const release = relation(checkout.physical_releases);
            const tote = relation(checkout.source_tote);
            const checkoutParts = [];

            if (checkout.checked_out_to) {
                checkoutParts.push(`To: ${checkout.checked_out_to}`);
            }

            if (checkout.destination) {
                checkoutParts.push(`Destination: ${checkout.destination}`);
            }

            return Object.assign(releaseValues(release), {
                tote: tote ? tote.tote_code : "",
                quantity: checkout.quantity,
                available_quantity: 0,
                checkout_information: checkoutParts.join(" | "),
                notes: checkout.notes || (release && release.notes) || "",
                transaction_date: formatDate(checkout.checked_out_at),
                transaction_type: "Checked Out"
            });
        });
    }

    async function loadHistory() {
        let query = supabase
            .from("inventory_transactions")
            .select(`
                id,
                transaction_type,
                quantity_delta,
                notes,
                created_at,
                physical_releases (
                    upc,
                    release_title,
                    edition,
                    format,
                    release_year,
                    notes,
                    metadata_status,
                    titles (
                        title,
                        year,
                        imdb_id
                    )
                ),
                totes (
                    tote_code
                )
            `)
            .order("created_at", {
                ascending: false
            });

        if (startDateInput.value) {
            query = query.gte(
                "created_at",
                new Date(`${startDateInput.value}T00:00:00`).toISOString()
            );
        }

        if (endDateInput.value) {
            query = query.lte(
                "created_at",
                new Date(`${endDateInput.value}T23:59:59.999`).toISOString()
            );
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        return (data || []).map((transaction) => {
            const release = relation(transaction.physical_releases);
            const tote = relation(transaction.totes);

            return Object.assign(releaseValues(release), {
                tote: tote ? tote.tote_code : "",
                quantity: transaction.quantity_delta,
                available_quantity: "",
                checkout_information: "",
                notes: transaction.notes || "",
                transaction_date: formatDate(transaction.created_at),
                transaction_type: String(transaction.transaction_type || "")
                    .replace(/_/g, " ")
            });
        });
    }

    function csvValue(value) {
        return `"${String(value === null || value === undefined ? "" : value)
            .replace(/"/g, '""')}"`;
    }

    function filename(scope, extension) {
        const date = new Date().toISOString().slice(0, 10);

        return `dvd-inventory-${scope}-${date}.${extension}`;
    }

    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function exportCsv(rows, fieldKeys, scope) {
        const lines = [fieldKeys.map((key) => csvValue(fields[key])).join(",")];

        for (const row of rows) {
            lines.push(fieldKeys.map((key) => {
                let value = key === "upc" && row[key]
                    ? `="${row[key]}"`
                    : row[key];

                if (
                    key !== "upc" &&
                    /^[=+\-@]/.test(String(value || ""))
                ) {
                    value = `'${value}`;
                }

                return csvValue(value);
            }).join(","));
        }

        downloadBlob(
            new Blob(["\ufeff", lines.join("\r\n")], {
                type: "text/csv;charset=utf-8"
            }),
            filename(scope, "csv")
        );
    }

    function exportXlsx(rows, fieldKeys, scope) {
        if (!window.XLSX) {
            throw new Error(
                "The Excel exporter did not load. Refresh and try again."
            );
        }

        const data = [
            fieldKeys.map((key) => fields[key]),
            ...rows.map((row) => fieldKeys.map((key) => row[key]))
        ];
        const sheet = window.XLSX.utils.aoa_to_sheet(data);
        const workbook = window.XLSX.utils.book_new();
        const upcColumn = fieldKeys.indexOf("upc");

        if (upcColumn >= 0) {
            for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
                const address = window.XLSX.utils.encode_cell({
                    r: rowIndex,
                    c: upcColumn
                });

                if (sheet[address]) {
                    sheet[address].t = "s";
                    sheet[address].z = "@";
                }
            }
        }

        sheet["!cols"] = fieldKeys.map((key) => ({
            wch: Math.min(
                45,
                Math.max(
                    fields[key].length + 2,
                    ...rows.map((row) => String(row[key] || "").length + 2)
                )
            )
        }));
        window.XLSX.utils.book_append_sheet(workbook, sheet, "DVD Inventory");
        window.XLSX.writeFile(workbook, filename(scope, "xlsx"));
    }

    function escapeHtml(value) {
        const element = document.createElement("div");

        element.textContent = String(
            value === null || value === undefined ? "" : value
        );

        return element.innerHTML;
    }

    function exportPdf(rows, fieldKeys, scope) {
        const iframe = document.createElement("iframe");
        const heading = `DVD Inventory - ${scope.replace(/_/g, " ")}`;
        const headerCells = fieldKeys
            .map((key) => `<th>${escapeHtml(fields[key])}</th>`)
            .join("");
        const bodyRows = rows.map((row) =>
            `<tr>${fieldKeys.map((key) =>
                `<td>${escapeHtml(row[key])}</td>`
            ).join("")}</tr>`
        ).join("");

        iframe.className = "export-print-frame";
        iframe.title = "Printable DVD inventory report";
        document.body.appendChild(iframe);

        const printDocument = iframe.contentDocument;

        printDocument.open();
        printDocument.write(`<!doctype html>
            <html><head><title>${escapeHtml(heading)}</title>
            <style>
                @page { size: landscape; margin: 0.45in; }
                body { font-family: Arial, sans-serif; color: #111; }
                h1 { margin: 0 0 6px; font-size: 20px; }
                p { margin: 0 0 16px; color: #444; font-size: 11px; }
                table { width: 100%; border-collapse: collapse; font-size: 9px; }
                th, td { padding: 5px; border: 1px solid #aaa; text-align: left; vertical-align: top; }
                th { background: #eee; }
                tr { break-inside: avoid; }
            </style></head><body>
            <h1>${escapeHtml(heading)}</h1>
            <p>${rows.length} records | Generated ${escapeHtml(formatDate(new Date()))}</p>
            <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
            </body></html>`);
        printDocument.close();

        window.setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        }, 250);
        window.setTimeout(() => iframe.remove(), 60000);
    }

    async function runExport() {
        if (exporting || !authenticated) {
            return;
        }

        const scope = selectedScope();
        const fieldKeys = selectedFields(scope);

        if (fieldKeys.length === 0) {
            setStatus("Select at least one field to export.", "error");
            return;
        }

        if (
            startDateInput.value &&
            endDateInput.value &&
            startDateInput.value > endDateInput.value
        ) {
            setStatus("The start date must be before the end date.", "error");
            return;
        }

        exporting = true;
        exportButton.disabled = true;
        exportButton.textContent = "Preparing Export...";
        setStatus("Loading export data...", "info");

        try {
            let rows;

            if (scope === "checkout") {
                rows = await loadCheckouts();
            }
            else if (scope === "history") {
                rows = await loadHistory();
            }
            else {
                rows = await loadInventory(scope);
            }

            if (rows.length === 0) {
                throw new Error("No records match the selected export scope.");
            }

            if (selectedFormat === "xlsx") {
                exportXlsx(rows, fieldKeys, scope);
            }
            else if (selectedFormat === "pdf") {
                exportPdf(rows, fieldKeys, scope);
            }
            else {
                exportCsv(rows, fieldKeys, scope);
            }

            summaryTitle.textContent = "Export created.";
            summaryText.textContent =
                `${rows.length} ${rows.length === 1 ? "record" : "records"} ` +
                `prepared as ${selectedFormat.toUpperCase()}.`;
            setStatus(
                selectedFormat === "pdf"
                    ? "The print dialog is ready. Choose Save as PDF or a printer."
                    : "Your export download has started.",
                "success"
            );
        }
        catch (error) {
            console.error("Failed to export inventory:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not create the export.",
                "error"
            );
        }
        finally {
            exporting = false;
            exportButton.disabled = false;
            exportButton.textContent = "Export Inventory";
        }
    }

    function updateOptions() {
        const scope = selectedScope();
        const needsTote = scope === "tote" || scope === "totes";

        toteOptions.classList.toggle("hidden", !needsTote);
        historyOptions.classList.toggle("hidden", scope !== "history");
        setStatus("");
    }

    async function loadToteChoices() {
        const { data, error } = await supabase
            .from("totes")
            .select("tote_code")
            .is("archived_at", null)
            .order("tote_code", {
                ascending: true
            });

        if (error) {
            console.error("Failed to load export tote choices:", error);
            return;
        }

        toteList.replaceChildren();

        for (const tote of data || []) {
            const option = document.createElement("option");

            option.value = tote.tote_code;
            toteList.appendChild(option);
        }
    }

    scopeInputs.forEach((input) => {
        input.addEventListener("change", updateOptions);
    });

    formatButtons.forEach((button) => {
        button.addEventListener("click", () => {
            selectedFormat = button.dataset.exportFormat;
            formatButtons.forEach((candidate) => {
                candidate.classList.toggle("selected", candidate === button);
            });
        });
    });

    exportButton.addEventListener("click", runExport);

    function initializeAuthenticated() {
        authenticated = true;
        loadToteChoices();
    }

    window.addEventListener("dvd-auth-ready", initializeAuthenticated);
    window.addEventListener("dvd-totes-changed", loadToteChoices);

    if (
        window.DVD_AUTH &&
        typeof window.DVD_AUTH.isAuthenticated === "function" &&
        window.DVD_AUTH.isAuthenticated()
    ) {
        initializeAuthenticated();
    }

    updateOptions();
})();
