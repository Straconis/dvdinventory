import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
        }
    });
}

function requiredString(
    value: unknown,
    fieldName: string,
    maximumLength = 200
) {
    const normalized = String(value || "").trim();

    if (!normalized) {
        throw new Error(`${fieldName} is required.`);
    }

    if (normalized.length > maximumLength) {
        throw new Error(`${fieldName} is too long.`);
    }

    return normalized;
}

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey =
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const authorization = request.headers.get("Authorization") || "";

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error("Server configuration is incomplete.");
        }

        if (!authorization.startsWith("Bearer ")) {
            return jsonResponse({ error: "Authentication required." }, 401);
        }

        const token = authorization.slice("Bearer ".length);
        const adminClient = createClient(
            supabaseUrl,
            serviceRoleKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );
        const {
            data: { user: caller },
            error: callerError
        } = await adminClient.auth.getUser(token);

        if (callerError || !caller) {
            return jsonResponse({ error: "Authentication required." }, 401);
        }

        const { data: callerProfile, error: profileError } =
            await adminClient
                .from("profiles")
                .select("id, role, active")
                .eq("id", caller.id)
                .maybeSingle();

        if (
            profileError ||
            !callerProfile ||
            !callerProfile.active ||
            callerProfile.role !== "admin"
        ) {
            return jsonResponse(
                { error: "Administrator privileges required." },
                403
            );
        }

        const body = await request.json();
        const action = requiredString(body.action, "Action", 40);

        if (action === "create_user") {
            const username = requiredString(
                body.username,
                "Username",
                32
            ).toLowerCase();
            const displayName = requiredString(
                body.displayName,
                "Display name",
                80
            );
            const email = requiredString(
                body.email,
                "Email",
                254
            ).toLowerCase();
            const temporaryPassword = requiredString(
                body.temporaryPassword,
                "Temporary password",
                200
            );

            if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
                throw new Error(
                    "Username must be 3-32 letters, numbers, dots, underscores, or hyphens."
                );
            }

            if (!/^\S+@\S+\.\S+$/.test(email)) {
                throw new Error("Enter a valid email address.");
            }

            if (temporaryPassword.length < 8) {
                throw new Error(
                    "Temporary password must be at least 8 characters."
                );
            }

            const {
                data: createdAuth,
                error: authCreateError
            } = await adminClient.auth.admin.createUser({
                email,
                password: temporaryPassword,
                email_confirm: true,
                user_metadata: {
                    username,
                    display_name: displayName
                }
            });

            if (authCreateError || !createdAuth.user) {
                throw new Error(
                    authCreateError?.message ||
                    "Could not create the authentication account."
                );
            }

            const userId = createdAuth.user.id;
            let profileCreated = false;

            try {
                const { data: profile, error: insertProfileError } =
                    await adminClient
                        .from("profiles")
                        .insert({
                            id: userId,
                            username,
                            display_name: displayName,
                            contact_email: email,
                            role: "user",
                            active: true,
                            must_change_password: true
                        })
                        .select(
                            "id, username, display_name, contact_email, role, active, must_change_password"
                        )
                        .single();

                if (insertProfileError) {
                    throw insertProfileError;
                }

                profileCreated = true;

                const { error: auditError } = await adminClient
                    .from("user_admin_audit")
                    .insert({
                        target_user_id: userId,
                        target_username: username,
                        action: "user_created",
                        new_value: "active user",
                        performed_by: caller.id
                    });

                if (auditError) {
                    throw auditError;
                }

                return jsonResponse({ profile });
            }
            catch (error) {
                if (profileCreated) {
                    await adminClient
                        .from("profiles")
                        .delete()
                        .eq("id", userId);
                }

                await adminClient.auth.admin.deleteUser(userId);
                throw error;
            }
        }

        if (action === "reset_password") {
            const targetUserId = requiredString(
                body.targetUserId,
                "Target user",
                50
            );
            const temporaryPassword = requiredString(
                body.temporaryPassword,
                "Temporary password",
                200
            );

            if (targetUserId === caller.id) {
                throw new Error(
                    "Use your account settings to change your own password."
                );
            }

            if (temporaryPassword.length < 8) {
                throw new Error(
                    "Temporary password must be at least 8 characters."
                );
            }

            const { data: targetProfile, error: targetError } =
                await adminClient
                    .from("profiles")
                    .select("id, username")
                    .eq("id", targetUserId)
                    .maybeSingle();

            if (targetError || !targetProfile) {
                throw new Error("User does not exist.");
            }

            const { error: passwordError } =
                await adminClient.auth.admin.updateUserById(
                    targetUserId,
                    { password: temporaryPassword }
                );

            if (passwordError) {
                throw passwordError;
            }

            const { error: updateProfileError } = await adminClient
                .from("profiles")
                .update({ must_change_password: true })
                .eq("id", targetUserId);

            if (updateProfileError) {
                throw updateProfileError;
            }

            const { error: auditError } = await adminClient
                .from("user_admin_audit")
                .insert({
                    target_user_id: targetUserId,
                    target_username: targetProfile.username,
                    action: "password_reset_requested",
                    performed_by: caller.id
                });

            if (auditError) {
                throw auditError;
            }

            return jsonResponse({ success: true });
        }

        return jsonResponse({ error: "Unsupported action." }, 400);
    }
    catch (error) {
        console.error("admin-users failed", error);

        return jsonResponse(
            {
                error: error instanceof Error
                    ? error.message
                    : "Request failed."
            },
            400
        );
    }
});
