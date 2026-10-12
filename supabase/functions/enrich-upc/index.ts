import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type JsonObject = Record<string, unknown>;

function jsonResponse(body: JsonObject, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
        }
    });
}

function optionalString(value: unknown) {
    const normalized = String(value || "").trim();

    return normalized || null;
}

function parseProviderTitle(value: unknown) {
    const original = String(value || "").trim();
    let title = original;
    let edition: string | null = null;
    let format = "DVD";

    const formatMatch = title.match(
        /\s*\((DVD|Blu-ray|4K Ultra HD)([^)]*)\)\s*/i
    );

    if (formatMatch) {
        const label = formatMatch[1].toLowerCase();

        format = label.includes("blu")
            ? "Blu-ray"
            : label.includes("4k")
                ? "4K Ultra HD"
                : "DVD";
        edition = optionalString(formatMatch[2]);
        title = title.replace(formatMatch[0], " ").trim();
    }

    title = title
        .replace(/\s*\[(DVD|Blu-ray|4K Ultra HD)\]\s*$/i, "")
        .trim();

    return {
        title: title || original,
        edition,
        format
    };
}

// Product names often contain format, edition, year, and seller notes.
function cleanMovieTitle(value: string) {
    return value.replace(/\s*[\[(].*$/, "")
        .replace(/\s+(?:DVD|Blu-ray|4K|Widescreen|Fullscreen|Unrated|Special Edition|Feature Films for Families|Sony Pictures|Paramount)\b.*$/i, "")
        .replace(/\s*,?\s*(?:19|20)\d{2}\s*$/, "")
        .trim();
}

function titleKey(value: string) {
    return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

async function findMoviePoster(title: string, token: string): Promise<{
    status: string; message: string; cover?: string;
}> {
    const query = cleanMovieTitle(title);
    if (!query || /^UPC\s|^NO-UPC-/i.test(query)) {
        return { status: "not_found", message: "A movie title is needed for poster lookup." };
    }
    const response = await fetch(
        "https://api.themoviedb.org/3/search/movie?include_adult=false&language=en-US&query=" + encodeURIComponent(query),
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(12000) }
    );
    if (response.status === 429) return { status: "rate_limited", message: "TMDb rate limit reached. Try again later." };
    if ([401, 403].includes(response.status)) return { status: "configuration_required", message: "The TMDb token is invalid or lacks access. Check TMDB_READ_ACCESS_TOKEN in Supabase." };
    if (!response.ok) throw new Error(`TMDb returned status ${response.status}.`);
    const payload = await response.json();
    const matches = (Array.isArray(payload.results) ? payload.results : []).filter((movie: JsonObject) =>
        movie.adult !== true &&
        [movie.title, movie.original_title].some(value => typeof value === "string" && titleKey(value) === titleKey(query))
    );
    // Never choose a popular remake over another movie with the same title.
    if (matches.length !== 1 || !/^\/[a-zA-Z0-9_-]+\.(jpg|png)$/.test(String(matches[0].poster_path || ""))) {
        return { status: "not_found", message: "No unambiguous movie poster match. Refine the movie title or upload a cover." };
    }
    return { status: "completed", message: "Movie poster found.", cover: "https://image.tmdb.org/t/p/w500" + matches[0].poster_path };
}

async function setQueueFailure(
    client: ReturnType<typeof createClient>,
    physicalReleaseId: number,
    message: string,
    retryAfterMinutes: number | null
) {
    const nextAttemptAt = retryAfterMinutes === null
        ? null
        : new Date(Date.now() + retryAfterMinutes * 60000).toISOString();

    await client
        .from("enrichment_queue")
        .update({
            status: "failed",
            last_error: message,
            next_attempt_at: nextAttemptAt,
            completed_at: null
        })
        .eq("physical_release_id", physicalReleaseId);
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
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const authorization = request.headers.get("Authorization") || "";

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error("Server configuration is incomplete.");
        }

        if (!authorization.startsWith("Bearer ")) {
            return jsonResponse({ error: "Authentication required." }, 401);
        }

        const token = authorization.slice("Bearer ".length);
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
        const {
            data: { user: caller },
            error: callerError
        } = await adminClient.auth.getUser(token);

        if (callerError || !caller) {
            return jsonResponse({ error: "Authentication required." }, 401);
        }

        const { data: profile, error: profileError } = await adminClient
            .from("profiles")
            .select("id, active, role")
            .eq("id", caller.id)
            .maybeSingle();

        if (profileError || !profile || !profile.active) {
            return jsonResponse({ error: "Active account required." }, 403);
        }

        const body = await request.json();
        const physicalReleaseId = Number(body.physicalReleaseId);
        const force = body.force === true;

        if (!Number.isInteger(physicalReleaseId) || physicalReleaseId <= 0) {
            return jsonResponse(
                { error: "A valid physical release is required." },
                400
            );
        }

        if (force && profile.role !== "admin") {
            return jsonResponse(
                { error: "Administrator privileges required for retry." },
                403
            );
        }

        const { data: release, error: releaseError } = await adminClient
            .from("physical_releases")
            .select(
                "id, upc, release_title, edition, format, studio, asin, cover_image_url, metadata_status"
            )
            .eq("id", physicalReleaseId)
            .maybeSingle();

        if (releaseError || !release) {
            return jsonResponse({ error: "DVD release was not found." }, 404);
        }

        // Cover scans never change metadata or use the metadata retry queue.
        if (body.coverOnly === true) {
            if (profile.role !== "admin") {
                return jsonResponse({ error: "Administrator privileges required." }, 403);
            }
            if (release.cover_image_url) {
                return jsonResponse({ status: "skipped", message: "Existing cover preserved." });
            }
            let cover: string | null = null;
            let providerTitle: string | null = null;
            let upcLimited = false;
            if (/^\d{8,14}$/.test(release.upc || "")) {
                const response = await fetch(
                    "https://api.upcitemdb.com/prod/trial/lookup?upc=" + encodeURIComponent(release.upc),
                    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) }
                );
                upcLimited = response.status === 429;
                if (response.ok) {
                    const payload = await response.json();
                    const item = Array.isArray(payload.items) ? payload.items[0] : null;
                    providerTitle = item ? parseProviderTitle(item.title).title : null;
                    cover = Array.isArray(item?.images)
                        ? item.images.find((url: unknown) => typeof url === "string" && /^https?:\/\//i.test(url)) || null
                        : null;
                } else if (![400, 404, 429].includes(response.status)) {
                    throw new Error(`UPC provider returned status ${response.status}.`);
                }
            }
            if (!cover) {
                const token = Deno.env.get("TMDB_READ_ACCESS_TOKEN");
                const title = providerTitle || release.release_title;
                if (!token) {
                    return jsonResponse({ status: "configuration_required", message: "Add the TMDB_READ_ACCESS_TOKEN secret in Supabase to enable movie poster lookup." });
                }
                if (title) {
                    const posterResult = await findMoviePoster(title, token);
                    if (posterResult.status !== "completed") return jsonResponse(posterResult);
                    cover = posterResult.cover!;
                }
            }
            if (!cover) {
                return jsonResponse({ status: upcLimited ? "rate_limited" : "not_found", message: upcLimited ? "UPC provider rate limit reached. Try again later." : "No cover or confident movie poster match available." });
            }
            // Conditional write also protects a cover uploaded while the lookup was running.
            const { data, error } = await adminClient.from("physical_releases")
                .update({ cover_image_url: cover })
                .eq("id", physicalReleaseId)
                .or("cover_image_url.is.null,cover_image_url.eq.")
                .select("id");
            if (error) throw error;
            return jsonResponse({
                status: data?.length ? "completed" : "skipped",
                message: data?.length ? "Cover added." : "Existing cover preserved."
            });
        }

        if (
            ["enriched", "verified"].includes(release.metadata_status) &&
            !force
        ) {
            return jsonResponse({
                status: "skipped",
                message: "Existing DVD metadata was preserved.",
                release
            });
        }

        const { data: existingQueue } = await adminClient
            .from("enrichment_queue")
            .select("id, attempts")
            .eq("physical_release_id", physicalReleaseId)
            .maybeSingle();

        const queueValues = {
            physical_release_id: physicalReleaseId,
            status: "processing",
            attempts: Number(existingQueue?.attempts || 0) + 1,
            last_attempt_at: new Date().toISOString(),
            next_attempt_at: null,
            last_error: null,
            completed_at: null
        };

        const { error: queueError } = await adminClient
            .from("enrichment_queue")
            .upsert(queueValues, {
                onConflict: "physical_release_id"
            });

        if (queueError) {
            throw queueError;
        }

        let providerResponse: Response;

        try {
            providerResponse = await fetch(
                "https://api.upcitemdb.com/prod/trial/lookup?upc=" +
                    encodeURIComponent(release.upc),
                {
                    headers: {
                        Accept: "application/json"
                    },
                    signal: AbortSignal.timeout(12000)
                }
            );
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Provider request failed.";

            await setQueueFailure(
                adminClient,
                physicalReleaseId,
                message,
                60
            );
            return jsonResponse({ status: "failed", message }, 502);
        }

        if (providerResponse.status === 429) {
            const message = "UPC provider rate limit reached. Retry later.";

            await setQueueFailure(
                adminClient,
                physicalReleaseId,
                message,
                15
            );
            return jsonResponse({ status: "failed", message }, 429);
        }

        if (!providerResponse.ok) {
            const message = providerResponse.status === 404 ||
                    providerResponse.status === 400
                ? "No provider match was found for this barcode."
                : `UPC provider returned status ${providerResponse.status}.`;

            await setQueueFailure(
                adminClient,
                physicalReleaseId,
                message,
                providerResponse.status >= 500 ? 60 : null
            );
            await adminClient
                .from("physical_releases")
                .update({ metadata_status: "incomplete" })
                .eq("id", physicalReleaseId)
                .neq("metadata_status", "verified");
            return jsonResponse({ status: "not_found", message });
        }

        const payload = await providerResponse.json();
        const item = Array.isArray(payload.items) ? payload.items[0] : null;

        if (!item) {
            const message = "No provider match was found for this barcode.";

            await setQueueFailure(
                adminClient,
                physicalReleaseId,
                message,
                null
            );
            await adminClient
                .from("physical_releases")
                .update({ metadata_status: "incomplete" })
                .eq("id", physicalReleaseId)
                .neq("metadata_status", "verified");
            return jsonResponse({ status: "not_found", message });
        }

        const parsedTitle = parseProviderTitle(item.title);
        const updates: Record<string, unknown> = {
            metadata_status: "enriched"
        };
        const provenance: Array<Record<string, unknown>> = [];
        const candidates = {
            release_title: parsedTitle.title,
            edition: parsedTitle.edition,
            format: parsedTitle.format,
            studio: optionalString(item.brand),
            asin: optionalString(item.asin),
            cover_image_url: Array.isArray(item.images)
                ? optionalString(item.images[0])
                : null
        };

        for (const [field, value] of Object.entries(candidates)) {
            if (!(release as Record<string, unknown>)[field] && value) {
                updates[field] = value;
                provenance.push({
                    physical_release_id: physicalReleaseId,
                    field_name: field,
                    source: "upcitemdb",
                    source_record_id: optionalString(item.ean || item.upc),
                    source_value: String(value),
                    manually_verified: false
                });
            }
        }

        const { data: updatedRelease, error: updateError } = await adminClient
            .from("physical_releases")
            .update(updates)
            .eq("id", physicalReleaseId)
            .neq("metadata_status", "verified")
            .select(
                "id, upc, release_title, edition, format, studio, asin, cover_image_url, metadata_status"
            )
            .single();

        if (updateError) {
            throw updateError;
        }

        if (provenance.length > 0) {
            const { error: provenanceError } = await adminClient
                .from("metadata_provenance")
                .insert(provenance);

            if (provenanceError) {
                throw provenanceError;
            }
        }

        const { error: completeError } = await adminClient
            .from("enrichment_queue")
            .update({
                status: "completed",
                last_error: null,
                next_attempt_at: null,
                completed_at: new Date().toISOString()
            })
            .eq("physical_release_id", physicalReleaseId);

        if (completeError) {
            throw completeError;
        }

        return jsonResponse({
            status: "completed",
            message: `Found ${updatedRelease.release_title}.`,
            release: updatedRelease
        });
    }
    catch (error) {
        console.error("UPC enrichment failed:", error);
        return jsonResponse(
            {
                error: error instanceof Error
                    ? error.message
                    : "UPC enrichment failed."
            },
            500
        );
    }
});
