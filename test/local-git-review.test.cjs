const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chmod, mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { GitWorkingTreeSource } = require('../dist/local-git/infrastructure/git-working-tree.source');

async function repository(t) {
  const root = await mkdtemp(join(tmpdir(), 'review-local-git-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', [
    '-c', 'user.name=Local Test', '-c', 'user.email=test@example.invalid',
    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args,
  ], { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  return { root, git, source: new GitWorkingTreeSource() };
}

test('reads the worktree from a subfolder, including staged, unstaged, new and structural changes', async (t) => {
  const { root, git, source } = await repository(t);
  const nested = join(root, 'src');
  await mkdir(nested);
  for (const name of ['file.ts', 'removed.ts', 'recreated.ts', 'link.ts', 'chmod.ts']) {
    await writeFile(join(nested, name), 'original\n');
  }
  await writeFile(join(root, '.gitignore'), '*.ignored\n');
  git('add', '--all');
  git('commit', '-qm', 'baseline');

  await writeFile(join(nested, 'file.ts'), 'staged\n');
  git('add', 'src/file.ts');
  await writeFile(join(nested, 'file.ts'), 'working\n');
  git('rm', '-q', 'src/recreated.ts');
  await writeFile(join(nested, 'recreated.ts'), 'recreated\n');
  await unlink(join(nested, 'removed.ts'));
  await chmod(join(nested, 'chmod.ts'), 0o755);
  await unlink(join(nested, 'link.ts'));
  await symlink('file.ts', join(nested, 'link.ts'));
  await writeFile(join(nested, 'new\nfile.ts'), 'new without newline');
  await writeFile(join(nested, 'empty.ts'), '');
  await writeFile(join(nested, 'data.bin'), Buffer.from([0, 255, 0]));
  await writeFile(join(nested, 'hidden.ignored'), 'ignored');

  const index = await readFile(join(root, '.git', 'index'));
  const result = await source.read(nested);
  assert.equal(result.ok, true, JSON.stringify(result));
  const files = Object.fromEntries(result.review.files.map((file) => [file.path, file]));
  assert.deepEqual(Object.keys(files).sort(), [
    'src/chmod.ts', 'src/data.bin', 'src/empty.ts', 'src/file.ts', 'src/link.ts',
    'src/new\nfile.ts', 'src/recreated.ts', 'src/removed.ts',
  ]);
  const changedLines = (path) => files[path].hunks.flatMap((hunk) => hunk.lines.map((line) => line.marker + line.text));
  assert.deepEqual(changedLines('src/file.ts'), ['-original', '+working']);
  assert.deepEqual(changedLines('src/recreated.ts'), ['-original', '+recreated']);
  assert.deepEqual(changedLines('src/link.ts'), ['-original', '+file.ts']);
  assert.deepEqual(changedLines('src/removed.ts'), ['-original']);
  assert.deepEqual(changedLines('src/new\nfile.ts'), ['+new without newline']);
  assert.equal(files['src/data.bin'].unavailable.reason, 'binary');
  assert.equal(files['src/empty.ts'].structuralChange, true);
  assert.deepEqual(files['src/chmod.ts'].hunks, []);
  assert.deepEqual(await readFile(join(root, '.git', 'index')), index);
});

test('handles empty worktrees, invalid folders, and repos without a commit', async (t) => {
  const { root, git, source } = await repository(t);
  assert.deepEqual(await source.read(join(root, '.git')), { ok: false, error: 'not-repository' });
  assert.deepEqual(await source.read(root), { ok: false, error: 'empty' });
  await writeFile(join(root, 'new.ts'), 'staged\n');
  git('add', 'new.ts');
  await writeFile(join(root, 'new.ts'), 'working\n');
  const result = await source.read(root);
  assert.equal(result.ok, true);
  assert.equal(result.review.targetBranch, 'Пустое дерево');
  assert.equal(result.review.files[0].hunks[0].lines[0].text, 'working');
});

test('repository diff and clean commands are never invoked', async (t) => {
  const { root, git, source } = await repository(t);
  await writeFile(join(root, 'data.txt'), 'before\n');
  await writeFile(join(root, '.gitattributes'), 'data.txt filter=unsafe diff=unsafe\n');
  git('add', '--all');
  git('commit', '-qm', 'baseline');
  git('config', 'filter.unsafe.clean', 'touch clean-was-run; cat');
  git('config', 'filter.unsafe.required', 'true');
  git('config', 'diff.unsafe.command', 'touch diff-was-run');
  git('config', 'diff.unsafe.textconv', 'touch textconv-was-run');
  await writeFile(join(root, 'data.txt'), 'after\n');
  const result = await source.read(root);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.review.files.map(({ path }) => path), ['data.txt']);
  for (const name of ['clean-was-run', 'diff-was-run', 'textconv-was-run']) {
    await assert.rejects(readFile(join(root, name)), { code: 'ENOENT' });
  }
});
