const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const path = require('node:path');

async function lookup({ role = 'admin', existingCover = null, images = ['https://example.com/cover.jpg'], providerStatus = 200, concurrentCover = false, token = null, movieTitle = 'Verified Movie', upc = '012345678901', results = [], tmdbStatus = 200 } = {}) {
    let handler, updates = [], filters = [], fetched = 0;
    const release = { id: 1, upc, release_title: movieTitle, metadata_status: 'verified', cover_image_url: existingCover };
    const client = {
        auth: { async getUser() { return { data: { user: { id: 'user' } } }; } },
        from(table) {
            const query = {
                select() { return this; }, eq() { return this; },
                or(filter) { filters.push(filter); return this; },
                update(values) { updates.push({ table, values }); return this; },
                async maybeSingle() { return { data: table === 'profiles' ? { active: true, role } : release }; },
                then(resolve) { resolve({ data: concurrentCover ? [] : [{ id: 1 }] }); }
            };
            return query;
        }
    };
    const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/enrich-upc/index.ts'), 'utf8').replace(/^import .*;\n/, '');
    vm.runInNewContext(stripTypeScriptTypes(source), {
        createClient: () => client,
        Deno: { env: { get: name => name === 'TMDB_READ_ACCESS_TOKEN' ? token : 'configured' }, serve: fn => { handler = fn; } },
        Response, Request, AbortSignal, console,
        fetch: async url => { fetched++; return url.includes('themoviedb') ? new Response(JSON.stringify({ results }), { status: tmdbStatus }) : new Response(JSON.stringify({ items: [{ images }] }), { status: providerStatus }); }
    });
    const response = await handler(new Request('https://example.com', {
        method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ physicalReleaseId: 1, coverOnly: true })
    }));
    return { status: response.status, body: await response.json(), updates, filters, fetched };
}

test('cover-only lookup fills verified releases without changing metadata', async () => {
    const result = await lookup();
    assert.equal(result.body.status, 'completed');
    assert.deepEqual(result.updates.map(x => ({ table: x.table, values: { ...x.values } })), [
        { table: 'physical_releases', values: { cover_image_url: 'https://example.com/cover.jpg' } }
    ]);
    assert.deepEqual(result.filters, ['cover_image_url.is.null,cover_image_url.eq.']);
});
test('existing covers do not trigger provider requests', async () => {
    const result = await lookup({ existingCover: 'https://example.com/manual.jpg' });
    assert.equal(result.body.status, 'skipped');
    assert.equal(result.fetched, 0);
    assert.equal(result.updates.length, 0);
});
test('concurrent cover uploads are preserved', async () => {
    assert.equal((await lookup({ concurrentCover: true })).body.status, 'skipped');
});
test('cover scans require an administrator', async () => {
    const result = await lookup({ role: 'user' });
    assert.equal(result.status, 403);
    assert.equal(result.fetched, 0);
});
test('missing or unsafe image URLs leave releases unchanged', async () => {
    for (const images of [[], ['javascript:alert(1)']]) {
        const result = await lookup({ images, token: 'test-token' });
        assert.equal(result.body.status, 'not_found');
        assert.equal(result.updates.length, 0);
    }
});
test('rate limits return a distinct result and do not update metadata', async () => {
    const result = await lookup({ providerStatus: 429, token: 'test-token', movieTitle: '' });
    assert.equal(result.body.status, 'rate_limited');
    assert.equal(result.updates.length, 0);
});

test('missing TMDb credential gives actionable configuration result', async () => {
    const result = await lookup({ images: [] });
    assert.equal(result.body.status, 'configuration_required');
    assert.equal(result.updates.length, 0);
});
test('TMDb fallback adds an exact matching poster without metadata changes', async () => {
    const result = await lookup({ images: [], token: 'token', movieTitle: 'Warm Bodies (DVD)', results: [{ title: 'Warm Bodies', poster_path: '/abc.jpg' }] });
    assert.equal(result.body.status, 'completed');
    assert.deepEqual({ ...result.updates[0].values }, { cover_image_url: 'https://image.tmdb.org/t/p/w500/abc.jpg' });
});
test('releases without UPC can use their movie title', async () => {
    const result = await lookup({ upc: 'NO-UPC-1', token: 'token', results: [{ title: 'Verified Movie', poster_path: '/abc.jpg' }] });
    assert.equal(result.body.status, 'completed');
    assert.equal(result.fetched, 1);
});
test('ambiguous remakes, unrelated results, and invalid poster paths are not saved', async () => {
    for (const results of [
        [{ title: 'Verified Movie', poster_path: '/abc.jpg' }, { title: 'Verified Movie', poster_path: '/def.jpg' }],
        [{ title: 'Other Movie', poster_path: '/abc.jpg' }],
        [{ title: 'Verified Movie', poster_path: '/../../other.jpg' }]
    ]) {
        const result = await lookup({ images: [], token: 'token', results });
        assert.equal(result.body.status, 'not_found');
        assert.equal(result.updates.length, 0);
    }
});
test('TMDb authentication and rate-limit failures are distinct', async () => {
    for (const [tmdbStatus, status] of [[401, 'configuration_required'], [429, 'rate_limited']]) {
        assert.equal((await lookup({ images: [], token: 'token', tmdbStatus })).body.status, status);
    }
});
test('UPC rate limit still allows a TMDb fallback', async () => {
    const result = await lookup({ providerStatus: 429, token: 'token', results: [{ title: 'Verified Movie', poster_path: '/abc.jpg' }] });
    assert.equal(result.body.status, 'completed');
});
