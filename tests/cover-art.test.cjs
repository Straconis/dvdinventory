const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function editor(options = {}) {
    const elements = {}, updates = [], uploads = [], removals = [], revoked = [];
    const element = id => elements[id] ||= {
        value: '', files: [], disabled: false,
        classList: { add() {}, remove() {} },
        addEventListener(type, listener) { this[type] = listener; },
        removeAttribute() {}, showModal() {}, close() { this.closed = true; }, focus() {}
    };
    const bucket = {
        async upload(name) { uploads.push(name); return { error: options.uploadError }; },
        getPublicUrl(name) { return { data: { publicUrl: `https://example.com/${name}` } }; },
        async remove(names) {
            removals.push(...names);
            if (options.cleanupThrows) throw new Error('Cleanup unavailable');
            return {};
        }
    };
    const db = {
        update(values) { updates.push(values); return this; },
        eq() { return this; }, select() { return this; },
        async single() {
            return options.databaseError ? { error: options.databaseError } : { data: updates.at(-1) };
        }
    };
    const window = {
        dvdSupabase: { storage: { from() { return bucket; } }, from() { return db; } },
        setTimeout() {}, dispatchEvent() {}
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/release-editor.js'), 'utf8'), {
        window, document: { getElementById: element },
        URL: { createObjectURL() { return 'blob:preview'; }, revokeObjectURL(url) { revoked.push(url); } },
        crypto: { randomUUID() { return 'unique'; } }, CustomEvent: function () {}, console: { error() {} }
    });
    window.DVD_RELEASE_EDITOR.open({ id: 7, upc: '123', release_title: 'Movie', cover_image_url: 'https://example.com/old.jpg' });
    return {
        element, updates, uploads, removals, revoked,
        async choose(file = { type: 'image/jpeg', size: 42 }, id = 'releaseEditorCoverUpload') {
            const input = element(id);
            input.files = [file];
            await input.change();
        },
        async save() { await element('releaseEditorForm').submit({ preventDefault() {} }); }
    };
}

test('upload selection previews locally and saves the new URL with the DVD', async () => {
    const app = editor();
    await app.choose();
    assert.equal(app.uploads.length, 0);
    assert.equal(app.element('releaseEditorCoverPreview').src, 'blob:preview');
    await app.save();
    assert.equal(app.uploads[0], '7/unique.jpg');
    assert.equal(app.updates[0].cover_image_url, 'https://example.com/7/unique.jpg');
    assert.equal(app.updates[0].metadata_status, 'verified');
    assert.equal(app.removals.length, 0);
    assert.equal(app.element('releaseEditorDialog').closed, true);
    assert.equal(app.element('saveReleaseEditorButton').disabled, false);
});

test('camera picker uses the same save flow', async () => {
    const app = editor();
    await app.choose({ type: 'image/png', size: 42 }, 'releaseEditorCoverCamera');
    await app.save();
    assert.equal(app.uploads[0], '7/unique.png');
});

test('editing text without a photo preserves the existing cover', async () => {
    const app = editor();
    await app.save();
    assert.equal(app.uploads.length, 0);
    assert.equal(Object.hasOwn(app.updates[0], 'cover_image_url'), false);
});

test('unsupported and oversized files are rejected before upload', async () => {
    for (const file of [{ type: 'image/heic', size: 42 }, { type: 'image/jpeg', size: 10485761 }]) {
        const app = editor();
        await app.choose(file);
        assert.match(app.element('releaseEditorStatus').textContent, /JPEG, PNG, or WebP/);
        await app.save();
        assert.equal(app.uploads.length, 0);
    }
});

test('cancel discards the pending photo without uploading', async () => {
    const app = editor();
    await app.choose();
    app.element('cancelReleaseEditorButton').click();
    await app.save();
    assert.equal(app.uploads.length, 0);
    assert.equal(app.updates.length, 0);
    assert.deepEqual(app.revoked, ['blob:preview']);
});

test('upload failure leaves the DVD unchanged and allows retry', async () => {
    const app = editor({ uploadError: new Error('Upload unavailable') });
    await app.choose();
    await app.save();
    assert.equal(app.updates.length, 0);
    assert.match(app.element('releaseEditorStatus').textContent, /Upload unavailable/);
    assert.equal(app.element('releaseEditorDialog').closed, undefined);
    assert.equal(app.element('saveReleaseEditorButton').disabled, false);
});

test('failed database save cleans up the upload and keeps the editor open', async () => {
    const app = editor({ databaseError: new Error('Database unavailable') });
    await app.choose();
    await app.save();
    assert.deepEqual(app.removals, ['7/unique.jpg']);
    assert.match(app.element('releaseEditorStatus').textContent, /Database unavailable/);
    assert.equal(app.element('releaseEditorDialog').closed, undefined);
});

test('cleanup failure still reports the save error and restores controls', async () => {
    const app = editor({ databaseError: new Error('Database unavailable'), cleanupThrows: true });
    await app.choose();
    await app.save();
    assert.match(app.element('releaseEditorStatus').textContent, /Database unavailable/);
    assert.equal(app.element('saveReleaseEditorButton').disabled, false);
    assert.equal(app.element('releaseEditorCoverUpload').disabled, false);
});
