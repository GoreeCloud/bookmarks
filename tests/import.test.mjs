import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importBatch, importWholeFile } from '../src/import.mjs';
import { assertLibrary } from '../src/schema.mjs';

const emptyLibrary = () => ({ schema: 1, bookmarks: [], collections: [] });

test('dry-run import on a cloned library predicts a real batch without mutating live records', () => {
  const live = emptyLibrary();
  const source = { collections: [{ id: 'external-id', name: 'Research' }], bookmarks: [
    { url: 'https://example.com/a?utm_source=news', collectionId: 'external-id', title: 'First' },
    { url: 'https://example.com/a', collectionId: 'external-id' },
    { url: 'javascript:alert(1)' }
  ] };
  const previewDraft = structuredClone(live);
  const estimated = importBatch(previewDraft, source);
  assert.deepEqual(live, emptyLibrary(), 'preview cannot alter source library');
  assert.deepEqual(estimated, { imported: 1, skipped: 2, collectionsCreated: 1 });
  assertLibrary(previewDraft);
  const committed = importBatch(live, source);
  assert.deepEqual(committed, estimated);
  assertLibrary(live);
  assert.equal(live.bookmarks[0].collectionId, live.collections[0].id);
  assert.equal(live.bookmarks[0].url, 'https://example.com/a');
});

test('shared import contract rejects ambiguity and excessive batch size', () => {
  const bad = { collections: [
    { id: 'id', name: 'One' }, { id: 'id', name: 'Two' }
  ], bookmarks: [] };
  assert.throws(() => importBatch(emptyLibrary(), bad), /Duplicate imported collection ID/);
  assert.throws(() => importBatch(emptyLibrary(), { bookmarks: Array(501).fill({ url: 'https://example.org' }) }),
    /up to 500 bookmarks/);
  assert.throws(() => importBatch(emptyLibrary(), { bookmarks: [], collections: [{ id: '', name: 'Broken' }] }),
    /Invalid imported collection/);
});


test('whole-file preview uses one draft and detects duplicates across 500-item boundaries', () => {
  const live = emptyLibrary();
  const source = {
    collections: [{ id: 'source-collection', name: 'Large Library' }],
    bookmarks: [
      ...Array.from({ length: 1201 }, (_, i) => ({ url: `https://example.org/item/${i}`, collectionId: 'source-collection' })),
      { url: 'https://example.org/item/0?utm_source=news', collectionId: 'source-collection' },
      { url: 'file:///etc/passwd', collectionId: 'source-collection' }
    ]
  };
  const preview = importWholeFile(structuredClone(live), source);
  assert.deepEqual(live, emptyLibrary(), 'preview draft cannot modify the persisted library');
  assert.deepEqual(preview, { imported: 1201, skipped: 2, collectionsCreated: 1 });
  const committed = importWholeFile(live, source);
  assert.deepEqual(committed, preview);
  assert.equal(live.bookmarks.length, 1201);
  assert.ok(live.bookmarks.every(b => b.collectionId === live.collections[0].id));
  assertLibrary(live);
});

test('whole-file limits and invalid collection mappings fail before modifying the source', () => {
  assert.throws(() => importWholeFile(emptyLibrary(), {
    bookmarks: Array.from({ length: 10001 }, () => ({ url: 'https://example.org' }))
  }), /10,000 bookmarks/);
  assert.throws(() => importWholeFile(emptyLibrary(), { bookmarks: [], collections: Array(201).fill({ id: 'i', name: 'N' }) }), /200 collections/);
  const live = emptyLibrary();
  assert.throws(() => importWholeFile(live, { bookmarks: [ { url: 'https://example.org/x' } ], collections: [
    { id: 'duplicate', name: 'One' }, { id: 'duplicate', name: 'Two' }
  ] }), /Duplicate imported collection ID/);
  assert.deepEqual(live, emptyLibrary());
});
