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
    const usersPageEyebrow =
        document.getElementById("usersPageEyebrow");
    const usersPageTitle =
        document.getElementById("usersPageTitle");
    const usersPageDescription =
        document.getElementById("usersPageDescription");
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
    const adminOnlyElements = Array.from(
        usersPage
            ? usersPage.querySelectorAll(".admin-only")
            : []
    );
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
    const ownPasswordDialog =
        document.getElementById("changeOwnPasswordDialog");
    const ownPasswordForm =
        document.getElementById("changeOwnPasswordForm");
    const currentAccountPassword =
        document.getElementById("currentAccountPassword");
    const newAccountPassword =
        document.getElementById("newAccountPassword");
    const confirmAccountPassword =
        document.getElementById("confirmAccountPassword");
    const cancelOwnPasswordButton =
        document.getElementById("cancelOwnPasswordButton");
    const saveOwnPasswordButton =
        document.getElementById("saveOwnPasswordButton");
    const ownEmailDialog =
        document.getElementById("changeOwnEmailDialog");
    const ownEmailForm =
        document.getElementById("changeOwnEmailForm");
    const currentEmailPassword =
        document.getElementById("currentEmailPassword");
    const newAccountEmail =
        document.getElementById("newAccountEmail");
    const confirmAccountEmail =
        document.getElementById("confirmAccountEmail");
    const cancelOwnEmailButton =
        document.getElementById("cancelOwnEmailButton");
    const saveOwnEmailButton =
        document.getElementById("saveOwnEmailButton");
    const userEmailDialog =
        document.getElementById("changeUserEmailDialog");
    const userEmailForm =
        document.getElementById("changeUserEmailForm");
    const userEmailUser =
        document.getElementById("changeUserEmailUser");
    const adminNewUserEmail =
        document.getElementById("adminNewUserEmail");
    const adminConfirmUserEmail =
        document.getElementById("adminConfirmUserEmail");
    const cancelUserEmailButton =
        document.getElementById("cancelUserEmailButton");
    const saveUserEmailButton =
        document.getElementById("saveUserEmailButton");
    const openPurgeButton =
        document.getElementById("openPurgeInventoryButton");
    const purgeStatus =
        document.getElementById("purgeInventoryStatus");
    const purgeDialog =
        document.getElementById("purgeInventoryDialog");
    const purgeForm =
        document.getElementById("purgeInventoryForm");
    const purgeConfirmationInput =
        document.getElementById("purgeInventoryConfirmation");
    const purgeDialogStatus =
        document.getElementById("purgeInventoryDialogStatus");
    const cancelPurgeButton =
        document.getElementById("cancelPurgeInventoryButton");
    const confirmPurgeButton =
        document.getElementById("confirmPurgeInventoryButton");

    let currentProfile = null;
    let users = [];
    let loadingUsers = false;
    let creatingUser = false;
    let resetTarget = null;
    let emailTarget = null;
    let purgingInventory = false;

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

    function setPurgeStatus(message, type) {
        purgeStatus.textContent = message || "";
        purgeStatus.classList.remove(
            "hidden",
            "workflow-status-success",
            "workflow-status-error",
            "workflow-status-info"
        );

        if (!message) {
            purgeStatus.classList.add("hidden");
            return;
        }

        purgeStatus.classList.add(
            `workflow-status-${type || "info"}`
        );
    }

    function setPurgeDialogStatus(message, type) {
        purgeDialogStatus.textContent = message || "";
        purgeDialogStatus.classList.remove(
            "hidden",
            "workflow-status-success",
            "workflow-status-error",
            "workflow-status-info"
        );

        if (!message) {
            purgeDialogStatus.classList.add("hidden");
            return;
        }

        purgeDialogStatus.classList.add(
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

    function createUserActionButton(
        label,
        className,
        handler,
        options
    ) {
        const settings = options || {};
        const button = document.createElement("button");

        button.type = "button";
        button.className = className;
        button.textContent = label;
        button.disabled = Boolean(settings.disabled);

        if (settings.title) {
            button.title = settings.title;
        }

        button.addEventListener("click", handler);
        return button;
    }

    function createPasswordResetToggle(profile) {
        const label = document.createElement("label");
        const text = createTextElement(
            "span",
            "user-password-toggle-label",
            "Password reset required"
        );
        const input = document.createElement("input");
        const control = document.createElement("span");

        label.className = "user-password-toggle";
        input.type = "checkbox";
        input.checked = Boolean(profile.must_change_password);
        input.setAttribute("role", "switch");
        input.setAttribute(
            "aria-label",
            `Password reset required for ${profile.username}`
        );
        control.className = "user-password-toggle-control";

        input.addEventListener("change", () => {
            setPasswordResetRequired(profile, input.checked, input);
        });

        label.append(text, input, control);
        return label;
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
            password_reset_required: "required a password reset",
            password_reset_cleared: "cleared the password reset requirement",
            password_changed: "changed the password",
            email_changed: `changed the email from ${audit.old_value} to ${audit.new_value}`,
            inventory_purged: "purged all inventory data and history"
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
                    audit.action === "inventory_purged"
                        ? ` ${describeAuditAction(audit)}.`
                        : ` ${describeAuditAction(audit)} for ${target}.`
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

    function openUserEmailDialog(profile) {
        emailTarget = profile;
        userEmailUser.textContent =
            `Change the sign-in email for ` +
            `${profile.display_name || profile.username}.`;
        adminNewUserEmail.value = profile.contact_email || "";
        adminConfirmUserEmail.value = profile.contact_email || "";
        userEmailDialog.showModal();
        window.setTimeout(() => adminNewUserEmail.focus(), 0);
    }

    function clearOwnPasswordInputs() {
        currentAccountPassword.value = "";
        newAccountPassword.value = "";
        confirmAccountPassword.value = "";
    }

    function clearOwnEmailInputs() {
        currentEmailPassword.value = "";
        newAccountEmail.value = "";
        confirmAccountEmail.value = "";
    }

    function openOwnPasswordDialog() {
        clearOwnPasswordInputs();
        ownPasswordDialog.showModal();
        window.setTimeout(() => currentAccountPassword.focus(), 0);
    }

    function openOwnEmailDialog() {
        clearOwnEmailInputs();

        const session =
            window.DVD_AUTH && window.DVD_AUTH.getSession();

        newAccountEmail.value =
            session && session.user && session.user.email
                ? session.user.email
                : currentProfile && currentProfile.contact_email
                    ? currentProfile.contact_email
                    : "";
        confirmAccountEmail.value = newAccountEmail.value;
        ownEmailDialog.showModal();
        window.setTimeout(() => newAccountEmail.focus(), 0);
    }

    function openPurgeDialog() {
        purgeConfirmationInput.value = "";
        confirmPurgeButton.disabled = true;
        setPurgeStatus("");
        setPurgeDialogStatus("");
        purgeDialog.showModal();
        window.setTimeout(() => purgeConfirmationInput.focus(), 0);
    }

    async function purgeInventory(event) {
        event.preventDefault();

        if (purgingInventory) {
            return;
        }

        const confirmation = String(
            purgeConfirmationInput.value || ""
        ).trim();

        if (confirmation !== "PURGE INVENTORY") {
            confirmPurgeButton.disabled = true;
            return;
        }

        const finalConfirmation = window.confirm(
            "Final confirmation: permanently remove ALL inventory data " +
            "and history?\n\nUser accounts will remain intact."
        );

        if (!finalConfirmation) {
            return;
        }

        purgingInventory = true;
        confirmPurgeButton.disabled = true;
        confirmPurgeButton.textContent = "Purging...";
        setPurgeDialogStatus(
            "Permanently removing inventory data...",
            "info"
        );

        try {
            const { data, error } = await supabase.rpc(
                "admin_purge_inventory_data",
                {
                    p_confirmation: confirmation
                }
            );

            if (error) {
                throw error;
            }

            purgeDialog.close();
            purgeConfirmationInput.value = "";

            const toteCount = Number(data && data.totes) || 0;
            const releaseCount =
                Number(data && data.physical_releases) || 0;
            const transactionCount =
                Number(data && data.transactions) || 0;

            setPurgeStatus(
                `Inventory purge complete: ${toteCount} totes, ` +
                    `${releaseCount} DVD releases, and ` +
                    `${transactionCount} transactions removed. ` +
                    "User accounts were preserved.",
                "success"
            );

            await loadUsers({ silent: true });

            if (
                window.DVD_TOTES &&
                typeof window.DVD_TOTES.clear === "function"
            ) {
                window.DVD_TOTES.clear();
            }

            window.dispatchEvent(
                new CustomEvent("dvd-inventory-changed")
            );
            window.dispatchEvent(
                new CustomEvent("dvd-totes-changed")
            );
        }
        catch (error) {
            console.error("Failed to purge inventory data:", error);
            setPurgeDialogStatus(
                error && error.message
                    ? error.message
                    : "Could not purge inventory data.",
                "error"
            );
        }
        finally {
            purgingInventory = false;
            confirmPurgeButton.textContent = "Permanently Purge";
            confirmPurgeButton.disabled =
                purgeConfirmationInput.value.trim() !== "PURGE INVENTORY";
        }
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

        const activeAdministratorCount = users.filter(
            (profile) =>
                profile.role === "admin" && profile.active
        ).length;

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

                const currentAccountActions =
                    document.createElement("div");

                currentAccountActions.className = "user-actions";
                currentAccountActions.appendChild(
                    createUserActionButton(
                        "Change My Password",
                        "user-action-button",
                        openOwnPasswordDialog
                    )
                );
                currentAccountActions.appendChild(
                    createUserActionButton(
                        "Change My Email",
                        "user-action-button",
                        openOwnEmailDialog
                    )
                );
                card.appendChild(currentAccountActions);
            }
            else {
                const actions = document.createElement("div");
                const isFinalActiveAdministrator =
                    profile.role === "admin" &&
                    profile.active &&
                    activeAdministratorCount <= 1;
                const finalAdministratorMessage =
                    "The final active administrator cannot be demoted or deactivated.";

                actions.className = "user-actions";
                actions.append(
                    createUserActionButton(
                        profile.role === "admin"
                            ? "Demote to User"
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
                        },
                        {
                            disabled: isFinalActiveAdministrator,
                            title: isFinalActiveAdministrator
                                ? finalAdministratorMessage
                                : ""
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
                        },
                        {
                            disabled: isFinalActiveAdministrator,
                            title: isFinalActiveAdministrator
                                ? finalAdministratorMessage
                                : ""
                        }
                    ),
                    createUserActionButton(
                        "Reset Password",
                        "user-action-button",
                        () => openPasswordDialog(profile)
                    ),
                    createUserActionButton(
                        "Change Email",
                        "user-action-button",
                        () => openUserEmailDialog(profile)
                    )
                );
                actions.appendChild(createPasswordResetToggle(profile));
                card.appendChild(actions);
            }

            userList.appendChild(card);
        }
    }

    async function loadUsers(options) {
        const settings = options || {};

        if (loadingUsers || !currentProfile) {
            return;
        }

        loadingUsers = true;
        refreshButton.disabled = true;

        if (!settings.silent) {
            setStatus("Loading users...", "info");
        }

        try {
            const isAdmin = currentProfile.role === "admin";
            const profileQuery = supabase
                .from("profiles")
                .select(
                    "id, username, display_name, contact_email, role, active, must_change_password, created_at, updated_at"
                )
                .order("username", { ascending: true });

            if (!isAdmin) {
                profileQuery.eq("id", currentProfile.id);
            }

            const profilesResult = await profileQuery;
            let auditRows = [];

            if (profilesResult.error) {
                throw profilesResult.error;
            }

            if (isAdmin) {
                const auditResult = await supabase
                    .from("user_admin_audit")
                    .select(
                        "id, target_user_id, target_username, action, old_value, new_value, performed_by, created_at"
                    )
                    .order("created_at", { ascending: false })
                    .limit(25);

                if (auditResult.error) {
                    throw auditResult.error;
                }

                auditRows = auditResult.data || [];
            }

            users = profilesResult.data || [];
            renderUsers();

            if (isAdmin) {
                renderAudit(auditRows);
            }

            if (!settings.silent) {
                setStatus(
                    users.length === 1
                        ? isAdmin
                            ? "Loaded 1 user."
                            : "Loaded your account."
                        : `Loaded ${users.length} users.`,
                    "success"
                );
            }
        }
        catch (error) {
            console.error("Failed to load user management:", error);
            setStatus(
                "Could not load account information.",
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

    async function changeUserEmail(event) {
        event.preventDefault();

        if (!emailTarget) {
            return;
        }

        const nextEmail = adminNewUserEmail.value.trim().toLowerCase();
        const confirmation =
            adminConfirmUserEmail.value.trim().toLowerCase();

        if (!/^\S+@\S+\.\S+$/.test(nextEmail)) {
            setStatus("Enter a valid email address.", "error");
            return;
        }

        if (nextEmail !== confirmation) {
            setStatus("The new email addresses do not match.", "error");
            return;
        }

        if (
            emailTarget.contact_email &&
            nextEmail === emailTarget.contact_email.toLowerCase()
        ) {
            setStatus("Enter a different email address.", "error");
            return;
        }

        saveUserEmailButton.disabled = true;
        saveUserEmailButton.textContent = "Changing...";

        try {
            const targetUsername = emailTarget.username;
            const { data, error } = await supabase.functions.invoke(
                "admin-users",
                {
                    body: {
                        action: "change_email",
                        targetUserId: emailTarget.id,
                        email: nextEmail
                    }
                }
            );

            if (error) {
                throw error;
            }

            if (data && data.error) {
                throw new Error(data.error);
            }

            userEmailDialog.close();
            emailTarget = null;
            await loadUsers({ silent: true });
            setStatus(
                `${targetUsername}'s email was changed to ${nextEmail}.`,
                "success"
            );
        }
        catch (error) {
            console.error("Failed to change user email:", error);
            setStatus(
                await getFunctionErrorMessage(
                    error,
                    "Could not change the user's email."
                ),
                "error"
            );
        }
        finally {
            saveUserEmailButton.disabled = false;
            saveUserEmailButton.textContent = "Change Email";
        }
    }

    async function setPasswordResetRequired(profile, required, input) {
        input.disabled = true;
        try {
            setStatus(`Updating ${profile.username}...`, "info");

            const { data, error } = await supabase.functions.invoke(
                "admin-users",
                {
                    body: {
                        action: "set_password_reset_required",
                        targetUserId: profile.id,
                        required
                    }
                }
            );

            if (error) {
                throw error;
            }

            if (data && data.error) {
                throw new Error(data.error);
            }

            await loadUsers({ silent: true });
            setStatus(
                required
                    ? `${profile.username} must reset their password.`
                    : `${profile.username}'s password reset requirement was cleared.`,
                "success"
            );
        }
        catch (error) {
            input.checked = Boolean(profile.must_change_password);
            console.error(
                "Failed to update password reset requirement:",
                error
            );
            setStatus(
                await getFunctionErrorMessage(
                    error,
                    "Could not update the password reset requirement."
                ),
                "error"
            );
        }
        finally {
            input.disabled = false;
        }
    }

    async function changeOwnPassword(event) {
        event.preventDefault();

        const currentPassword = currentAccountPassword.value;
        const newPassword = newAccountPassword.value;
        const confirmation = confirmAccountPassword.value;

        if (newPassword.length < 8) {
            setStatus(
                "New password must be at least 8 characters.",
                "error"
            );
            return;
        }

        if (newPassword !== confirmation) {
            setStatus("The new passwords do not match.", "error");
            return;
        }

        if (currentPassword === newPassword) {
            setStatus(
                "Choose a new password that differs from the current password.",
                "error"
            );
            return;
        }

        const session =
            window.DVD_AUTH && window.DVD_AUTH.getSession();
        const email =
            session && session.user ? session.user.email : "";

        if (!email) {
            setStatus(
                "Could not verify the signed-in account.",
                "error"
            );
            return;
        }

        saveOwnPasswordButton.disabled = true;
        saveOwnPasswordButton.textContent = "Changing...";

        try {
            const { error: signInError } =
                await supabase.auth.signInWithPassword({
                    email,
                    password: currentPassword
                });

            if (signInError) {
                throw new Error("The current password is incorrect.");
            }

            const { error: updateError } =
                await supabase.auth.updateUser({
                    password: newPassword
                });

            if (updateError) {
                throw updateError;
            }

            clearOwnPasswordInputs();
            ownPasswordDialog.close();
            setStatus(
                "Your password was changed successfully.",
                "success"
            );
        }
        catch (error) {
            console.error("Failed to change current password:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not change your password.",
                "error"
            );
        }
        finally {
            saveOwnPasswordButton.disabled = false;
            saveOwnPasswordButton.textContent = "Change Password";
        }
    }

    async function changeOwnEmail(event) {
        event.preventDefault();

        const currentPassword = currentEmailPassword.value;
        const nextEmail = newAccountEmail.value.trim();
        const confirmation = confirmAccountEmail.value.trim();

        if (!/^\S+@\S+\.\S+$/.test(nextEmail)) {
            setStatus("Enter a valid email address.", "error");
            return;
        }

        if (nextEmail.toLowerCase() !== confirmation.toLowerCase()) {
            setStatus("The new email addresses do not match.", "error");
            return;
        }

        const session =
            window.DVD_AUTH && window.DVD_AUTH.getSession();
        const currentEmail =
            session && session.user ? session.user.email : "";

        if (!currentEmail) {
            setStatus(
                "Could not verify the signed-in account.",
                "error"
            );
            return;
        }

        if (nextEmail.toLowerCase() === currentEmail.toLowerCase()) {
            setStatus(
                "Enter a new email address that differs from the current email.",
                "error"
            );
            return;
        }

        saveOwnEmailButton.disabled = true;
        saveOwnEmailButton.textContent = "Changing...";

        try {
            const { error: signInError } =
                await supabase.auth.signInWithPassword({
                    email: currentEmail,
                    password: currentPassword
                });

            if (signInError) {
                throw new Error("The current password is incorrect.");
            }

            const { error: updateAuthError } =
                await supabase.auth.updateUser({
                    email: nextEmail
                });

            if (updateAuthError) {
                throw updateAuthError;
            }

            const { data: updatedProfile, error: profileError } =
                await supabase.rpc(
                    "update_own_contact_email",
                    {
                        new_contact_email: nextEmail
                    }
                );

            if (profileError) {
                throw profileError;
            }

            if (updatedProfile) {
                currentProfile = Array.isArray(updatedProfile)
                    ? updatedProfile[0] || currentProfile
                    : updatedProfile;
            }

            clearOwnEmailInputs();
            ownEmailDialog.close();
            await loadUsers({ silent: true });
            setStatus(
                "Your email update was saved. Check your inbox if confirmation is required.",
                "success"
            );
        }
        catch (error) {
            console.error("Failed to change current email:", error);
            setStatus(
                error && error.message
                    ? error.message
                    : "Could not change your email.",
                "error"
            );
        }
        finally {
            saveOwnEmailButton.disabled = false;
            saveOwnEmailButton.textContent = "Change Email";
        }
    }

    function initializeForProfile(profile) {
        currentProfile = profile || null;
        const isActiveUser = Boolean(
            currentProfile &&
            currentProfile.active
        );
        const isAdmin = Boolean(
            currentProfile &&
            currentProfile.active &&
            currentProfile.role === "admin"
        );

        navigationButton.classList.toggle("hidden", !isActiveUser);
        usersPage.classList.toggle("hidden", !isActiveUser);

        for (const element of adminOnlyElements) {
            element.classList.toggle("hidden", !isAdmin);
        }

        if (usersPageEyebrow) {
            usersPageEyebrow.textContent = isAdmin
                ? "ADMINISTRATION"
                : "ACCOUNT";
        }

        if (usersPageTitle) {
            usersPageTitle.textContent = isAdmin
                ? "User Management"
                : "My Account";
        }

        if (usersPageDescription) {
            usersPageDescription.textContent = isAdmin
                ? "Create accounts, manage access, and review administrative history."
                : "Review your account details and update your password or email address.";
        }

        if (!isActiveUser) {
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

    if (ownPasswordForm) {
        ownPasswordForm.addEventListener(
            "submit",
            changeOwnPassword
        );
    }

    if (ownEmailForm) {
        ownEmailForm.addEventListener(
            "submit",
            changeOwnEmail
        );
    }

    if (userEmailForm) {
        userEmailForm.addEventListener("submit", changeUserEmail);
    }

    if (cancelPasswordButton) {
        cancelPasswordButton.addEventListener("click", () => {
            passwordDialog.close();
            resetTarget = null;
        });
    }

    if (cancelOwnPasswordButton) {
        cancelOwnPasswordButton.addEventListener("click", () => {
            clearOwnPasswordInputs();
            ownPasswordDialog.close();
        });
    }

    if (cancelOwnEmailButton) {
        cancelOwnEmailButton.addEventListener("click", () => {
            clearOwnEmailInputs();
            ownEmailDialog.close();
        });
    }

    if (cancelUserEmailButton) {
        cancelUserEmailButton.addEventListener("click", () => {
            userEmailDialog.close();
            emailTarget = null;
        });
    }

    if (openPurgeButton) {
        openPurgeButton.addEventListener("click", openPurgeDialog);
    }

    if (purgeConfirmationInput) {
        purgeConfirmationInput.addEventListener("input", () => {
            confirmPurgeButton.disabled =
                purgeConfirmationInput.value.trim() !== "PURGE INVENTORY";
        });
    }

    if (purgeForm) {
        purgeForm.addEventListener("submit", purgeInventory);
    }

    if (cancelPurgeButton) {
        cancelPurgeButton.addEventListener("click", () => {
            purgeConfirmationInput.value = "";
            purgeDialog.close();
        });
    }
})();
