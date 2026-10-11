const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const path = require('node:path');

async function lookup({ role = 'admin', existingCover = null, images = ['https://example.com/cover.jpg'], providerStatus = 200, concurrentCover = false } = {}) {
    let handler, updates = [], filters = [], fetched = 0;
    const release = { id: 1, upc: '012345678901', release_title: 'Verified Movie', metadata_status: 'verified', cover_image_url: existingCover };
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
        Deno: { env: { get: () => 'configured' }, serve: fn => { handler = fn; } },
        Response, AbortSignal, console,
        fetch: async () => { fetched++; return new Response(JSON.stringify({ items: [{ images }] }), { status: providerStatus }); }
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
        const result = await lookup({ images });
        assert.equal(result.body.status, 'not_found');
        assert.equal(result.updates.length, 0);
    }
});
test('rate limits return a distinct result and do not update metadata', async () => {
    const result = await lookup({ providerStatus: 429 });
    assert.equal(result.body.status, 'rate_limited');
    assert.equal(result.updates.length, 0);
});
