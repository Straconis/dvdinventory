(function () {
    "use strict";

    if (!window.dvdSupabase) {
        throw new Error(
            "DVD Inventory Supabase client was not initialized."
        );
    }

    const supabase = window.dvdSupabase;

    const authGate =
        document.getElementById("authGate");

    const authLoading =
        document.getElementById("authLoading");

    const loginForm =
        document.getElementById("loginForm");

    const loginEmail =
        document.getElementById("loginEmail");

    const loginPassword =
        document.getElementById("loginPassword");

    const loginButton =
        document.getElementById("loginButton");

    const loginError =
        document.getElementById("loginError");

    const authDenied =
        document.getElementById("authDenied");

    const authDeniedMessage =
        document.getElementById("authDeniedMessage");

    const deniedLogoutButton =
        document.getElementById("deniedLogoutButton");

    const userMenu =
        document.getElementById("userMenu");

    const currentUserDisplayName =
        document.getElementById("currentUserDisplayName");

    const currentUserRole =
        document.getElementById("currentUserRole");

    const logoutButton =
        document.getElementById("logoutButton");

    let currentSession = null;
    let currentProfile = null;


    function hide(element) {
        if (element) {
            element.classList.add("hidden");
        }
    }


    function show(element) {
        if (element) {
            element.classList.remove("hidden");
        }
    }


    function setLoginError(message) {
        if (!loginError) {
            return;
        }

        if (!message) {
            loginError.textContent = "";
            hide(loginError);
            return;
        }

        loginError.textContent = message;
        show(loginError);
    }


    function showLoading() {
        document.body.classList.add("auth-loading");
        document.body.classList.remove("authenticated");

        show(authGate);
        show(authLoading);

        hide(loginForm);
        hide(authDenied);
        hide(userMenu);
    }


    function showLogin() {
        currentSession = null;
        currentProfile = null;

        document.body.classList.add("auth-loading");
        document.body.classList.remove("authenticated");

        show(authGate);
        hide(authLoading);
        hide(authDenied);
        hide(userMenu);

        show(loginForm);

        setLoginError("");

        if (loginPassword) {
            loginPassword.value = "";
        }

        window.setTimeout(() => {
            if (loginEmail) {
                loginEmail.focus();
            }
        }, 0);
    }


    function showDenied(message) {
        document.body.classList.add("auth-loading");
        document.body.classList.remove("authenticated");

        show(authGate);
        hide(authLoading);
        hide(loginForm);
        hide(userMenu);

        if (authDeniedMessage) {
            authDeniedMessage.textContent =
                message ||
                "This account cannot access DVD Inventory.";
        }

        show(authDenied);
    }


    function showApplication(profile) {
        currentProfile = profile;

        if (currentUserDisplayName) {
            currentUserDisplayName.textContent =
                profile.display_name ||
                profile.username ||
                "User";
        }

        if (currentUserRole) {
            currentUserRole.textContent =
                profile.role === "admin"
                    ? "Administrator"
                    : "User";
        }

        hide(authGate);
        show(userMenu);

        document.body.classList.remove("auth-loading");
        document.body.classList.add("authenticated");

        window.dispatchEvent(
            new CustomEvent(
                "dvd-auth-ready",
                {
                    detail: {
                        session: currentSession,
                        profile: currentProfile
                    }
                }
            )
        );
    }


    async function loadProfile(session) {
        if (!session || !session.user) {
            return null;
        }

        const {
            data,
            error
        } = await supabase
            .from("profiles")
            .select(
                "id, username, display_name, contact_email, role, active, must_change_password"
            )
            .eq("id", session.user.id)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return data;
    }


    async function acceptSession(session) {
        if (!session || !session.user) {
            showLogin();
            return;
        }

        currentSession = session;

        let profile;

        try {
            profile = await loadProfile(session);
        }
        catch (error) {
            console.error(
                "Failed to load DVD Inventory profile:",
                error
            );

            showDenied(
                "Your account authenticated, but your DVD Inventory profile could not be loaded."
            );

            return;
        }

        if (!profile) {
            showDenied(
                "This authenticated account does not have a DVD Inventory profile."
            );

            return;
        }

        if (!profile.active) {
            showDenied(
                "This DVD Inventory account is inactive."
            );

            return;
        }

        showApplication(profile);
    }


    async function signOut() {
        showLoading();

        try {
            const {
                error
            } = await supabase.auth.signOut();

            if (error) {
                throw error;
            }
        }
        catch (error) {
            console.error(
                "Sign out failed:",
                error
            );
        }

        currentSession = null;
        currentProfile = null;

        showLogin();
    }


    async function handleLogin(event) {
        event.preventDefault();

        setLoginError("");

        const email =
            loginEmail?.value.trim() || "";

        const password =
            loginPassword?.value || "";

        if (!email || !password) {
            setLoginError(
                "Enter both your email and password."
            );

            return;
        }

        if (loginButton) {
            loginButton.disabled = true;
            loginButton.textContent = "Signing In...";
        }

        try {
            const {
                data,
                error
            } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                throw error;
            }

            if (!data.session) {
                throw new Error(
                    "Authentication completed without a session."
                );
            }

            await acceptSession(data.session);

            if (loginPassword) {
                loginPassword.value = "";
            }
        }
        catch (error) {
            console.error(
                "DVD Inventory login failed:",
                error
            );

            setLoginError(
                "Sign in failed. Check your email and password."
            );
        }
        finally {
            if (loginButton) {
                loginButton.disabled = false;
                loginButton.textContent = "Sign In";
            }
        }
    }


    async function initializeAuth() {
        showLoading();

        const {
            data,
            error
        } = await supabase.auth.getSession();

        if (error) {
            console.error(
                "Could not restore Supabase session:",
                error
            );

            showLogin();
            return;
        }

        await acceptSession(
            data.session || null
        );
    }


    if (loginForm) {
        loginForm.addEventListener(
            "submit",
            handleLogin
        );
    }


    if (logoutButton) {
        logoutButton.addEventListener(
            "click",
            signOut
        );
    }


    if (deniedLogoutButton) {
        deniedLogoutButton.addEventListener(
            "click",
            signOut
        );
    }


    supabase.auth.onAuthStateChange(
        (event, session) => {
            if (event === "SIGNED_OUT") {
                currentSession = null;
                currentProfile = null;
                showLogin();
            }
        }
    );


    window.DVD_AUTH = Object.freeze({
        getSession() {
            return currentSession;
        },

        getProfile() {
            return currentProfile;
        },

        isAuthenticated() {
            return Boolean(
                currentSession &&
                currentProfile &&
                currentProfile.active
            );
        },

        isAdmin() {
            return Boolean(
                currentProfile &&
                currentProfile.active &&
                currentProfile.role === "admin"
            );
        },

        signOut
    });


    initializeAuth().catch((error) => {
        console.error(
            "DVD Inventory authentication initialization failed:",
            error
        );

        showDenied(
            "DVD Inventory authentication could not be initialized."
        );
    });
})();
