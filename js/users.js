(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    const supabase = window.dvdSupabase;
    const navigationButton =
        document.getElementById("usersNavigationButton");
    const usersPage = document.getElementById("users");
    const status = document.getElementById("userManagementStatus");
    const createForm = document.getElementById("createUserForm");
    const usernameInput = document.getElementById("newUserUsername");
    const displayNameInput =
        document.getElementById("newUserDisplayName");
    const emailInput = document.getElementById("newUserEmail");
    const createPasswordInput =
        document.getElementById("newUserTemporaryPassword");
    const createButton = document.getElementById("createUserButton");
    const refreshButton = document.getElementById("refreshUsersButton");
    const userList = document.getElementById("userList");
    const auditList = document.getElementById("userAuditList");
    const passwordDialog =
        document.getElementById("temporaryPasswordDialog");
    const passwordForm =
        document.getElementById("temporaryPasswordForm");
    const passwordUser =
        document.getElementById("temporaryPasswordUser");
    const resetPasswordInput =
        document.getElementById("resetTemporaryPassword");
    const cancelPasswordButton =
        document.getElementById("cancelTemporaryPasswordButton");
    const savePasswordButton =
        document.getElementById("saveTemporaryPasswordButton");

    let currentProfile = null;
    let users = [];
    let loadingUsers = false;
    let creatingUser = false;
    let resetTarget = null;

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

    function createTextElement(tagName, className, text) {
        const element = document.createElement(tagName);

        if (className) {
            element.className = className;
        }

        element.textContent = text;
        return element;
    }

    function createUserActionButton(label, className, handler) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = className;
        button.textContent = label;
        button.addEventListener("click", handler);
        return button;
    }

    function formatDate(value) {
        if (!value) {
            return "Unknown time";
        }

        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(new Date(value));
    }

    function describeAuditAction(audit) {
        const labels = {
            user_created: "created the account",
            user_activated: "activated the account",
            user_deactivated: "deactivated the account",
            role_changed: `changed the role from ${audit.old_value} to ${audit.new_value}`,
            password_reset_requested: "set a temporary password",
            password_changed: "changed the password"
        };

        return labels[audit.action] || audit.action.replaceAll("_", " ");
    }

    async function getFunctionErrorMessage(error, fallback) {
        try {
            if (
                error &&
                error.context &&
                typeof error.context.json === "function"
            ) {
                const payload = await error.context.json();

                if (payload && payload.error) {
                    return payload.error;
                }
            }
        }
        catch (contextError) {
            console.error(
                "Could not read Edge Function error response:",
                contextError
            );
        }

        return error && error.message
            ? error.message
            : fallback;
    }

    function renderAudit(auditRows) {
        auditList.replaceChildren();

        if (!auditRows || auditRows.length === 0) {
            auditList.appendChild(
                createTextElement(
                    "p",
                    "user-empty-state",
                    "No administrative changes have been recorded yet."
                )
            );
            return;
        }

        const profilesById = new Map(
            users.map((profile) => [profile.id, profile])
        );

        for (const audit of auditRows) {
            const performer = profilesById.get(audit.performed_by);
            const item = document.createElement("article");
            const summary = document.createElement("p");
            const actor = performer
                ? performer.display_name || performer.username
                : "Administrator";
            const target = audit.target_username || "deleted user";

            item.className = "audit-item";
            summary.append(
                createTextElement("strong", "", actor),
                document.createTextNode(
                    ` ${describeAuditAction(audit)} for ${target}.`
                )
            );
            item.append(
                summary,
                createTextElement(
                    "time",
                    "audit-time",
                    formatDate(audit.created_at)
                )
            );
            auditList.appendChild(item);
        }
    }

    function openPasswordDialog(profile) {
        resetTarget = profile;
        passwordUser.textContent =
            `Set a temporary password for ` +
            `${profile.display_name || profile.username}.`;
        resetPasswordInput.value = "";
        passwordDialog.showModal();
        window.setTimeout(() => resetPasswordInput.focus(), 0);
    }

    async function updateUser(profile, changes, successMessage) {
        try {
            setStatus(`Updating ${profile.username}...`, "info");

            const { error } = await supabase.rpc(
                "admin_update_user",
                {
                    target_user: profile.id,
                    new_role: Object.prototype.hasOwnProperty.call(
                        changes,
                        "role"
                    ) ? changes.role : null,
                    new_active: Object.prototype.hasOwnProperty.call(
                        changes,
                        "active"
                    ) ? changes.active : null
                }
            );

            if (error) {
                throw error;
            }

            await loadUsers({ silent: true });
            setStatus(successMessage, "success");
        }
        catch (error) {
            console.error("Failed to update user:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not update that user.",
                "error"
            );
        }
    }

    function renderUsers() {
        userList.replaceChildren();

        if (users.length === 0) {
            userList.appendChild(
                createTextElement(
                    "p",
                    "user-empty-state",
                    "No user profiles were found."
                )
            );
            return;
        }

        for (const profile of users) {
            const card = document.createElement("article");
            const heading = document.createElement("div");
            const identity = document.createElement("div");
            const badges = document.createElement("div");

            card.className = "user-item";
            heading.className = "user-item-heading";
            identity.append(
                createTextElement(
                    "strong",
                    "user-display-name",
                    profile.display_name || profile.username
                ),
                createTextElement(
                    "span",
                    "user-account-detail",
                    `@${profile.username}` +
                    (profile.contact_email
                        ? ` | ${profile.contact_email}`
                        : "")
                )
            );

            badges.className = "user-badges";
            badges.append(
                createTextElement(
                    "span",
                    `user-badge user-role-${profile.role}`,
                    profile.role === "admin" ? "Administrator" : "User"
                ),
                createTextElement(
                    "span",
                    profile.active
                        ? "user-badge user-status-active"
                        : "user-badge user-status-inactive",
                    profile.active ? "Active" : "Inactive"
                )
            );

            if (profile.must_change_password) {
                badges.appendChild(
                    createTextElement(
                        "span",
                        "user-badge user-password-pending",
                        "Password setup required"
                    )
                );
            }

            heading.append(identity, badges);
            card.appendChild(heading);

            if (profile.id === currentProfile.id) {
                card.appendChild(
                    createTextElement(
                        "p",
                        "current-account-note",
                        "Current account"
                    )
                );
            }
            else {
                const actions = document.createElement("div");

                actions.className = "user-actions";
                actions.append(
                    createUserActionButton(
                        profile.role === "admin"
                            ? "Make User"
                            : "Make Administrator",
                        "user-action-button",
                        () => {
                            const nextRole =
                                profile.role === "admin"
                                    ? "user"
                                    : "admin";
                            const confirmed = window.confirm(
                                `Change ${profile.username}'s role to ` +
                                `${nextRole === "admin" ? "Administrator" : "User"}?`
                            );

                            if (confirmed) {
                                updateUser(
                                    profile,
                                    { role: nextRole },
                                    `${profile.username}'s role was updated.`
                                );
                            }
                        }
                    ),
                    createUserActionButton(
                        profile.active ? "Deactivate" : "Reactivate",
                        profile.active
                            ? "user-action-button user-action-danger"
                            : "user-action-button",
                        () => {
                            const nextActive = !profile.active;
                            const confirmed = window.confirm(
                                `${nextActive ? "Reactivate" : "Deactivate"} ` +
                                `${profile.username}?`
                            );

                            if (confirmed) {
                                updateUser(
                                    profile,
                                    { active: nextActive },
                                    `${profile.username} was ` +
                                    `${nextActive ? "reactivated" : "deactivated"}.`
                                );
                            }
                        }
                    ),
                    createUserActionButton(
                        "Reset Password",
                        "user-action-button",
                        () => openPasswordDialog(profile)
                    )
                );
                card.appendChild(actions);
            }

            userList.appendChild(card);
        }
    }

    async function loadUsers(options) {
        const settings = options || {};

        if (loadingUsers || !currentProfile || currentProfile.role !== "admin") {
            return;
        }

        loadingUsers = true;
        refreshButton.disabled = true;

        if (!settings.silent) {
            setStatus("Loading users...", "info");
        }

        try {
            const [profilesResult, auditResult] = await Promise.all([
                supabase
                    .from("profiles")
                    .select(
                        "id, username, display_name, contact_email, role, active, must_change_password, created_at, updated_at"
                    )
                    .order("username", { ascending: true }),
                supabase
                    .from("user_admin_audit")
                    .select(
                        "id, target_user_id, target_username, action, old_value, new_value, performed_by, created_at"
                    )
                    .order("created_at", { ascending: false })
                    .limit(25)
            ]);

            if (profilesResult.error) {
                throw profilesResult.error;
            }

            if (auditResult.error) {
                throw auditResult.error;
            }

            users = profilesResult.data || [];
            renderUsers();
            renderAudit(auditResult.data || []);

            if (!settings.silent) {
                setStatus(
                    users.length === 1
                        ? "Loaded 1 user."
                        : `Loaded ${users.length} users.`,
                    "success"
                );
            }
        }
        catch (error) {
            console.error("Failed to load user management:", error);
            setStatus(
                "Could not load user management. Check your administrator access.",
                "error"
            );
        }
        finally {
            loadingUsers = false;
            refreshButton.disabled = false;
        }
    }

    async function createUser(event) {
        event.preventDefault();

        if (creatingUser) {
            return;
        }

        creatingUser = true;
        createButton.disabled = true;
        createButton.textContent = "Creating...";

        try {
            setStatus("Creating user...", "info");

            const { data, error } = await supabase.functions.invoke(
                "admin-users",
                {
                    body: {
                        action: "create_user",
                        username: usernameInput.value,
                        displayName: displayNameInput.value,
                        email: emailInput.value,
                        temporaryPassword: createPasswordInput.value
                    }
                }
            );

            if (error) {
                throw error;
            }

            if (data && data.error) {
                throw new Error(data.error);
            }

            const createdUsername =
                data && data.profile
                    ? data.profile.username
                    : usernameInput.value.trim().toLowerCase();

            createForm.reset();
            await loadUsers({ silent: true });
            setStatus(
                `${createdUsername} was created and must change their temporary password.`,
                "success"
            );
        }
        catch (error) {
            console.error("Failed to create user:", error);
            setStatus(
                await getFunctionErrorMessage(
                    error,
                    "Could not create the user."
                ),
                "error"
            );
        }
        finally {
            creatingUser = false;
            createButton.disabled = false;
            createButton.textContent = "Create User";
        }
    }

    async function resetPassword(event) {
        event.preventDefault();

        if (!resetTarget) {
            return;
        }

        savePasswordButton.disabled = true;
        savePasswordButton.textContent = "Saving...";

        try {
            const { data, error } = await supabase.functions.invoke(
                "admin-users",
                {
                    body: {
                        action: "reset_password",
                        targetUserId: resetTarget.id,
                        temporaryPassword: resetPasswordInput.value
                    }
                }
            );

            if (error) {
                throw error;
            }

            if (data && data.error) {
                throw new Error(data.error);
            }

            const username = resetTarget.username;

            passwordDialog.close();
            resetTarget = null;
            await loadUsers({ silent: true });
            setStatus(
                `${username}'s temporary password was saved.`,
                "success"
            );
        }
        catch (error) {
            console.error("Failed to reset password:", error);
            setStatus(
                await getFunctionErrorMessage(
                    error,
                    "Could not reset the password."
                ),
                "error"
            );
        }
        finally {
            savePasswordButton.disabled = false;
            savePasswordButton.textContent = "Save Password";
        }
    }

    function initializeForProfile(profile) {
        currentProfile = profile || null;
        const isAdmin = Boolean(
            currentProfile &&
            currentProfile.active &&
            currentProfile.role === "admin"
        );

        navigationButton.classList.toggle("hidden", !isAdmin);
        usersPage.classList.toggle("hidden", !isAdmin);

        if (!isAdmin) {
            if (window.location.hash === "#users") {
                const dashboardButton = document.querySelector(
                    '[data-page="dashboard"]'
                );

                if (dashboardButton) {
                    dashboardButton.click();
                }
            }
            return;
        }

        loadUsers({ silent: true });
    }

    window.addEventListener("dvd-auth-ready", (event) => {
        initializeForProfile(event.detail && event.detail.profile);
    });

    window.addEventListener("DOMContentLoaded", () => {
        if (
            window.DVD_AUTH &&
            window.DVD_AUTH.isAuthenticated()
        ) {
            initializeForProfile(window.DVD_AUTH.getProfile());
        }
    });

    if (createForm) {
        createForm.addEventListener("submit", createUser);
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", () => loadUsers());
    }

    if (passwordForm) {
        passwordForm.addEventListener("submit", resetPassword);
    }

    if (cancelPasswordButton) {
        cancelPasswordButton.addEventListener("click", () => {
            passwordDialog.close();
            resetTarget = null;
        });
    }
})();
