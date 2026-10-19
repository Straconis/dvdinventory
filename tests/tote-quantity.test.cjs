const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
    const elements = new Map();
    function element() {
        return { children: [], textContent: '', dataset: {},
            classList: { add() {}, remove() {}, toggle() {} },
            addEventListener() {}, setAttribute() {},
            append(...items) { this.children.push(...items); },
            appendChild(item) { this.children.push(item); },
            replaceChildren(...items) { this.children = items; } };
    }
    const getElementById = id => {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
    };
    const events = {};
    const state = { rows: [], error: null, requests: 0, signedIn: true };
    const totes = [{ id: 1, tote_code: 'A' }, { id: 2, tote_code: 'B' },
        { id: 3, tote_code: 'C' }, { id: 4, tote_code: 'D', archived_at: '2026-01-01' }];
    const supabase = {
        auth: { getSession: async () => ({ data: { session: state.signedIn ? {} : null } }),
            onAuthStateChange() {} },
        from(table) {
            let after = 0;
            const query = {
                select(fields) {
                    if (table === 'inventory') assert.equal(fields, 'id, tote_id, quantity');
                    return query;
                },
                gt(field, value) {
                    if (field === 'id') after = value;
                    else { assert.equal(field, 'quantity'); assert.equal(value, 0); }
                    return query;
                },
                order(field, options) {
                    assert.equal(field, table === 'inventory' ? 'id' : 'tote_code');
                    assert.equal(options.ascending, true);
                    return query;
                },
                limit(n) { assert.equal(n, 1000); return query; },
                then(resolve, reject) {
                    if (table === 'totes') return Promise.resolve({ data: totes }).then(resolve, reject);
                    state.requests++;
                    // Simulate a server response limit smaller than the requested page.
                    return Promise.resolve({ data: state.rows.filter(r => r.id > after && r.quantity > 0).slice(0, 2),
                        error: state.error }).then(resolve, reject);
                }
            };
            return query;
        }
    };
    const window = { dvdSupabase: supabase, DVD_BARCODES: {},
        addEventListener(name, handler) { events[name] = handler; }, setTimeout };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/totes.js'), 'utf8'), {
        window, document: { getElementById, createElement: element },
        console: { error() {} }
    });
    const quantities = id => getElementById(id).children.map(card =>
        card.children.find(child => child.className === 'tote-item-quantity')?.textContent);
    return { state, load: window.DVD_TOTES.load, events, getElementById, quantities };
}

test('listing sums stored copies per tote across every server page, including empty and archived totes', async () => {
    const app = setup();
    app.state.rows = [
        { id: 1, tote_id: 1, quantity: 4 }, { id: 2, tote_id: 1, quantity: 3 },
        { id: 3, tote_id: 2, quantity: 1 }, { id: 4, tote_id: 3, quantity: 0 },
        { id: 5, tote_id: 1, quantity: 2 }
    ];
    await app.load();
    assert.deepEqual(app.quantities('toteList'), [
        'Contents quantity: 9 units', 'Contents quantity: 1 unit', 'Contents quantity: 0 units'
    ]);
    assert.deepEqual(app.quantities('archivedToteList'), ['Contents quantity: 0 units']);
    assert.equal(app.state.requests, 3);
});

test('inventory change reloads quantities after checkout, return, transfer, or adjustment', async () => {
    const app = setup();
    app.state.rows = [{ id: 1, tote_id: 1, quantity: 5 }];
    await app.load();
    app.state.rows = [{ id: 1, tote_id: 1, quantity: 2 }, { id: 2, tote_id: 2, quantity: 3 }];
    app.events['dvd-inventory-changed']();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(app.quantities('toteList').slice(0, 2), [
        'Contents quantity: 2 units', 'Contents quantity: 3 units'
    ]);
});

test('failed quantity query reports an error without displaying false zero counts', async () => {
    const app = setup();
    app.state.error = { message: 'Inventory unavailable' };
    await app.load();
    assert.deepEqual(app.quantities('toteList'), []);
    assert.match(app.getElementById('toteStatus').textContent, /Could not load totes/);
    assert.equal(app.getElementById('refreshTotesButton').disabled, false);
});

test('signed-out users do not query inventory', async () => {
    const app = setup();
    app.state.signedIn = false;
    await app.load();
    assert.equal(app.state.requests, 0);
});
