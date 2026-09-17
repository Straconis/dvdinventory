(function () {
    "use strict";

    if (!window.DVD_CONFIG) {
        throw new Error("DVD Inventory configuration was not loaded.");
    }

    if (!window.supabase) {
        throw new Error("Supabase JavaScript library was not loaded.");
    }

    const { createClient } = window.supabase;

    window.dvdSupabase = createClient(
        window.DVD_CONFIG.supabaseUrl,
        window.DVD_CONFIG.supabasePublishableKey,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        }
    );
})();
