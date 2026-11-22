const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { ReviewProgress } = require('../dist/review/application/review-progress');
const { createReview } = require('../dist/review/domain/review');
const { DiskReviewProgressStore } = require('../dist/review/infrastructure/disk-review-progress.store');
const { parseUnifiedDiff } = require('../dist/review/infrastructure/unified-diff');

function review(value, { sourceAddress = 'https://gitlab.example.test', unavailable = false } = {}) {
  return createReview({
    sourceAddress, project: 'team/shop', reference: 'MR !42', title: 'Test', sourceBranch: 'topic', targetBranch: 'main',
  }, [
    unavailable ? { path: 'a.ts', hunks: [], unavailable: {} }
      : { path: 'a.ts', hunks: parseUnifiedDiff(`@@ -1 +1 @@\n-old\n+${value}`) },
    { path: 'b.ts', hunks: parseUnifiedDiff('@@ -1 +1 @@\n-old\n+new') },
  ]);
}

async function localStore(t) {
  const directory = await mkdtemp(join(tmpdir(), 'review-progress-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: new DiskReviewProgressStore(directory) };
}

test('only file switches increment and diff changes reset only the mark', async (t) => {
  const { directory, store } = await localStore(t);
  const progress = new ReviewProgress(store);
  const snapshot = await progress.open(review('first'));
  const [a, b] = snapshot.files;
  const update = ({ path, fingerprint }, viewed) => progress.update(snapshot.key, path, fingerprint, viewed);
  const operations = await Promise.all([update(a), update(a, true), update(a), update(b), update(a)]);
  assert.ok(operations.every((result) => result.ok));
  assert.equal(operations.at(-1).fileProgress.opens, 2);
  assert.equal(operations.at(-1).fileProgress.viewed, true);

  const restarted = new ReviewProgress(store);
  const restored = await restarted.open(review('first'));
  assert.equal(restored.restoredPath, 'a.ts');
  assert.deepEqual(restored.files.map(({ opens, viewed }) => [opens, viewed]), [[2, true], [1, false]]);
  const partial = await restarted.open(review('first', { unavailable: true }));
  assert.equal(partial.files[0].viewed, true);
  const changed = await restarted.open(review('second'));
  assert.deepEqual(changed.files.map(({ opens, viewed }) => [opens, viewed]), [[2, false], [1, false]]);
  assert.deepEqual(await update(a, true), { ok: false, error: 'stale-progress' });

  const contents = await readFile(join(directory, snapshot.key + '.json'), 'utf8');
  assert.doesNotMatch(contents, /gitlab\.example|a\.ts|team\/shop|first|second/);
});

test('unrelated hosts have separate progress and corrupt storage is preserved', async (t) => {
  const { directory, store } = await localStore(t);
  const progress = new ReviewProgress(store);
  const first = await progress.open(review('first'));
  const second = await progress.open(review('first', { sourceAddress: 'https://other.example.test' }));
  assert.notEqual(first.key, second.key);
  const filename = join(directory, first.key + '.json');
  await writeFile(filename, 'broken');
  const [file] = first.files;
  assert.deepEqual(await progress.update(first.key, file.path, file.fingerprint, true), {
    ok: false, error: 'progress-storage',
  });
  await assert.rejects(progress.open(review('first')));
  assert.equal(await readFile(filename, 'utf8'), 'broken');
  assert.equal((await progress.open(review('first', { sourceAddress: 'https://other.example.test' }))).hasOpenedFile, false);
});
