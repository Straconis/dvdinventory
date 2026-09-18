(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    const supabase = window.dvdSupabase;

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

    let loadingTotes = false;
    let creatingTote = false;

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

    function renderTotes(totes) {
        if (!toteList) {
            return;
        }

        toteList.replaceChildren();

        if (!Array.isArray(totes) || totes.length === 0) {
            toteList.appendChild(
                createTextElement(
                    "p",
                    "tote-empty-state",
                    "No totes have been created yet."
                )
            );

            return;
        }

        for (const tote of totes) {
            const card =
                document.createElement("article");

            card.className = "tote-item";

            const heading =
                document.createElement("div");

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

            const locationText =
                tote.physical_location
                    ? `Location: ${tote.physical_location}`
                    : "Location: Not specified";

            card.appendChild(
                createTextElement(
                    "p",
                    "tote-item-location",
                    locationText
                )
            );

            toteList.appendChild(card);
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
                    "id, tote_code, description, physical_location, created_at, updated_at"
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
                    "id, tote_code, description, physical_location, created_at, updated_at"
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
                    `${toteCode} already exists.`,
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
