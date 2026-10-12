const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function inventory() {
    const elements = {};
    const element = id => elements[id] ||= { value: 'all', textContent: '',
        addEventListener() {}, classList: { add() {}, remove() {} },
        replaceChildren() {}, appendChild() {} };
    let shown, rows;
    const window = { dvdSupabase: {}, addEventListener() {},
        DVD_APP: { showPage: page => { shown = page; } } };
    const records = [
        { id: 1, release_title: 'Complete', format: 'DVD', release_year: 2000, studio: 'Studio', cover_image_url: 'https://example.com/cover' },
        { id: 2, release_title: 'No Cover', format: 'DVD', release_year: 2000, studio: 'Studio', cover_image_url: null },
        { id: 3, release_title: 'No Studio', format: 'DVD', release_year: 2000, studio: '', cover_image_url: 'https://example.com/cover' }
    ];
    let source = fs.readFileSync(path.join(__dirname, '../js/inventory.js'), 'utf8');
    // Intercept rendering only; run actual filter and navigation code.
    source = source.replace('})();', `
        libraryReleases = fixtures.map(release => ({ release, quantity: 0, locations: [] }));
        renderResults = (container, items) => capture(items);
    })();`);
    vm.runInNewContext(source, { window, document: { getElementById: element },
        fixtures: records, capture: items => { rows = items; }, console });
    return { show: filter => window.DVD_INVENTORY.showCompleteness(filter),
        ids: () => Array.from(rows, item => item.release.id), page: () => shown, element };
}
test('cover drill-down includes zero-stock editions and excludes existing covers', () => {
    const app = inventory();
    app.show('missing-covers');
    assert.deepEqual(app.ids(), [2]);
    assert.equal(app.page(), 'inventory');
    assert.equal(app.element('inventoryQuantityFilter').value, 'missing-covers');
});
test('details drill-down excludes editions only missing artwork', () => {
    const app = inventory();
    app.show('missing-details');
    assert.deepEqual(app.ids(), [3]);
    assert.match(app.element('inventorySummary').textContent, /across the full library/);
});
