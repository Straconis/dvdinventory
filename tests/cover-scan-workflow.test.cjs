const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function scanner({ releases = [], respond = () => ({ data: { status: 'not_found' } }), onPause } = {}) {
    const elements = {}, calls = [], cursors = [], waits = [];
    let changed = 0;
    const element = id => elements[id] ||= {
        disabled: false, classList: { add() {}, remove() {} },
        addEventListener(type, fn) { this[type] = fn; }, replaceChildren() {}, appendChild() {}
    };
    const profile = { role: 'admin', active: true };
    const db = {
        select() { return this; }, or() { return this; },
        gt(field, value) { cursors.push(value); this.cursor = value; return this; },
        order() { return this; }, limit() { return this; },
        then(resolve) { resolve({ data: releases.filter(x => x.id > this.cursor).slice(0, 100) }); }
    };
    const window = {
        dvdSupabase: { from: () => db, functions: {
            async invoke(name, { body }) { calls.push(body.physicalReleaseId); return respond(body.physicalReleaseId, calls.length); }
        } },
        DVD_AUTH: { isAuthenticated: () => true, getProfile: () => profile },
        addEventListener(name, fn) { if (name === 'dvd-auth-ready') fn({ detail: { profile } }); },
        dispatchEvent() { changed++; },
        setTimeout(fn, ms) { waits.push(ms); onPause?.(element); fn(); }
    };
    // Avoid queue loading during the auth event, which is separate from scanning.
    const source = fs.readFileSync(path.join(__dirname, '../js/enrichment.js'), 'utf8');
    vm.runInNewContext(source, {
        window, document: { getElementById: id => id === 'enrichmentList' ? null : element(id) },
        CustomEvent: function() {}, console: { error() {}, warn() {} }
    });
    return { calls, cursors, waits, element, changed: () => changed, scan: () => element('scanMissingCoversButton').click() };
}

test('scan walks hundreds of records beyond page boundaries', async () => {
    const app = scanner({ releases: Array.from({ length: 205 }, (_, i) => ({ id: i + 1, release_title: 'Movie' })) });
    await app.scan();
    assert.equal(app.calls.length, 205);
    assert.deepEqual(app.cursors, [0, 100, 200, 205]);
    assert.match(app.element('coverScanStatus').textContent, /205 checked/);
});
test('rate limits pause and automatically retry the same release', async () => {
    const app = scanner({ releases: [{ id: 1 }], respond: (id, call) => ({ data: { status: call === 1 ? 'rate_limited' : 'completed' } }) });
    await app.scan();
    assert.deepEqual(app.calls, [1, 1]);
    assert.equal(app.waits.length, 30);
    assert.match(app.element('coverScanStatus').textContent, /1 covers added/);
    assert.equal(app.changed(), 1);
});
test('persistent server errors retry then continue to the next movie', async () => {
    const app = scanner({ releases: [{ id: 1 }, { id: 2 }], respond: id => id === 1
        ? { error: { message: 'Timeout', context: { status: 504, async json() { return {}; } } } }
        : { data: { status: 'completed' } } });
    await app.scan();
    assert.deepEqual(app.calls, [1, 1, 1, 1, 2]);
    assert.match(app.element('coverScanStatus').textContent, /2 checked; 1 covers added.*1 failed/);
});
test('stop interrupts automatic pause without another lookup', async () => {
    const app = scanner({ releases: [{ id: 1 }], respond: () => ({ data: { status: 'rate_limited' } }),
        onPause: element => element('stopCoverScanButton').click() });
    await app.scan();
    assert.deepEqual(app.calls, [1]);
    assert.equal(app.waits.length, 1);
    assert.match(app.element('coverScanStatus').textContent, /Scan stopped/);
    assert.equal(app.element('scanMissingCoversButton').disabled, false);
});
test('invalid credentials stop without repeated requests', async () => {
    const app = scanner({ releases: [{ id: 1 }, { id: 2 }], respond: () => ({ data: { status: 'configuration_required', message: 'Invalid token' } }) });
    await app.scan();
    assert.deepEqual(app.calls, [1]);
    assert.equal(app.waits.length, 0);
    assert.match(app.element('coverScanStatus').textContent, /Invalid token/);
});
