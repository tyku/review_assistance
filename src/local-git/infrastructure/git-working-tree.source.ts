import { execFile } from 'node:child_process';
import { lstat, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { LocalReviewResult, LocalReviewSource } from '../application/open-local-review';
import { createReview, type FileDiff } from '../../review/domain/review';
import { parseUnifiedDiff } from '../../review/infrastructure/unified-diff';

const exec = promisify(execFile);
const MAX_DIFF_BYTES = 16 * 1024 * 1024;
const MAX_FILES = 3_000;
const DIFF_FLAGS = ['--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--unified=3'];

interface CommandError extends Error {
  code?: string | number;
  stderr?: string;
  stdout?: string;
}

class ReviewTooLarge extends Error {}
class GitMissing extends Error {}

function gitEnvironment(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  return {
    ...env,
    LC_ALL: 'C',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_LAZY_FETCH: '1',
    GIT_ALLOW_PROTOCOL: '',
  };
}

async function runGit(
  cwd: string, env: NodeJS.ProcessEnv, args: string[], acceptedExitCode?: number,
): Promise<string> {
  try {
    const { stdout } = await exec('git', [
      '--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null',
      '-c', 'diff.suppressBlankEmpty=false', ...args,
    ], { cwd, env, encoding: 'utf8', maxBuffer: MAX_DIFF_BYTES, timeout: 10_000, windowsHide: true });
    return stdout;
  } catch (error) {
    const failure = error as CommandError;
    if (failure.code === 'ENOENT') throw new GitMissing();
    if (acceptedExitCode !== undefined && failure.code === acceptedExitCode
      && !/^(?:error|fatal):/m.test(failure.stderr ?? '')) return failure.stdout ?? '';
    if (failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw new ReviewTooLarge();
    throw error;
  }
}

function disableConfiguredFilters(env: NodeJS.ProcessEnv, keys: string): void {
  const configurations = keys.split('\0').filter(Boolean);
  env.GIT_CONFIG_COUNT = String(configurations.length);
  configurations.forEach((key, index) => {
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = key.endsWith('.required') ? 'false' : '';
  });
}

function fileDiff(path: string, patches: readonly string[], structuralChange: boolean): FileDiff {
  if (patches.some((patch) => /^Binary files /m.test(patch))) {
    return { path, hunks: [], structuralChange, unavailable: { reason: 'binary' } };
  }
  const hunks = patches.flatMap((patch) => {
    const start = patch.search(/^@@ /m);
    return start < 0 ? [] : parseUnifiedDiff(patch.slice(start).replace(/\n$/, ''));
  });
  return { path, hunks, structuralChange, ...(structuralChange || hunks.length ? {} : { unavailable: {} }) };
}

const splitPatches = (output: string): string[] => output.split(/^diff --git /m).slice(1);

interface TrackedFile {
  path: string;
  oldMode: string;
  oldObject: string;
  state: string;
  diff: FileDiff;
}

function parseTrackedFiles(output: string): TrackedFile[] {
  if (!output) return [];
  const boundary = output.indexOf('\0\0');
  if (boundary < 0) throw new Error('Missing raw Git diff separator');
  const metadata = output.slice(0, boundary).split('\0');
  const patches = splitPatches(output.slice(boundary + 2));
  if (metadata.length / 2 > MAX_FILES) throw new ReviewTooLarge();
  const files: TrackedFile[] = [];
  let patchIndex = 0;
  for (let index = 0; index < metadata.length; index += 2) {
    const header = /^:(\d{6}) (\d{6}) ([0-9a-f]+) [0-9a-f]+ ([A-Z])\d*$/.exec(metadata[index]);
    if (!header) throw new Error('Invalid raw Git diff entry');
    const [, oldMode, newMode, oldObject, state] = header;
    const path = metadata[index + 1];
    const sections = state === 'T' ? 2 : 1;
    const parts = patches.slice(patchIndex, patchIndex + sections);
    if (parts.length !== sections || !path) throw new Error('Missing Git patch');
    patchIndex += sections;
    const diff = fileDiff(path, parts, oldMode !== newMode || state !== 'M');
    files.push({ path, oldMode, oldObject, state, diff });
  }
  if (patchIndex !== patches.length) throw new Error('Unexpected Git patch count');
  return files;
}

function diffAgainstFile(root: string, env: NodeJS.ProcessEnv, before: string, path: string): Promise<string> {
  return runGit(root, env, ['diff', '--no-index', ...DIFF_FLAGS, '--', before, './' + path], 1);
}

async function recreateDiff(root: string, env: NodeJS.ProcessEnv, tracked: TrackedFile): Promise<FileDiff | undefined> {
  if (!/^100(?:644|755)$|^120000$/.test(tracked.oldMode)) return tracked.diff;
  const directory = await mkdtemp(join(tmpdir(), 'review-git-base-'));
  try {
    const before = join(directory, 'base');
    const { stdout: content } = await exec('git', ['cat-file', 'blob', tracked.oldObject], {
      cwd: root, env, encoding: 'buffer', maxBuffer: MAX_DIFF_BYTES, timeout: 10_000, windowsHide: true,
    }).catch((error: CommandError) => {
      if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw new ReviewTooLarge();
      throw error;
    });
    if (tracked.oldMode === '120000') await symlink(content.toString(), before);
    else await writeFile(before, content, { mode: tracked.oldMode === '100755' ? 0o755 : 0o644 });
    const patch = await diffAgainstFile(root, env, before, tracked.path);
    if (!patch) return;
    return fileDiff(tracked.path, splitPatches(patch), /^(?:old mode|new mode|deleted file mode|new file mode) /m.test(patch));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readUntracked(
  root: string, env: NodeJS.ProcessEnv, path: string, tracked?: TrackedFile,
): Promise<FileDiff | undefined> {
  const candidate = join(root, path);
  const parent = relative(root, await realpath(dirname(candidate)));
  if (isAbsolute(parent) || parent === '..' || parent.startsWith('..' + sep)) throw new Error('Path outside worktree');
  const stat = await lstat(candidate);
  if (!stat.isFile() && !stat.isSymbolicLink()) return { path, hunks: [], structuralChange: true, unavailable: {} };
  if (tracked?.state === 'D') return recreateDiff(root, env, tracked);
  const patch = await diffAgainstFile(root, env, '/dev/null', path);
  return fileDiff(path, splitPatches(patch), true);
}

export class GitWorkingTreeSource implements LocalReviewSource {
  async read(directory: string): Promise<LocalReviewResult> {
    try {
      const env = gitEnvironment();
      const selected = await realpath(directory).catch(() => undefined);
      if (!selected) return { ok: false, error: 'read-failed' };
      const root = await realpath((await runGit(selected, env, ['rev-parse', '--show-toplevel'])).replace(/\n$/, ''));
      const filterKeys = await runGit(root, env, [
        'config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|process|required)$',
      ], 1);
      disableConfiguredFilters(env, filterKeys);

      const [head, branch, others] = await Promise.all([
        runGit(root, env, ['rev-parse', '--verify', '--quiet', 'HEAD'], 1),
        runGit(root, env, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 1),
        runGit(root, env, ['ls-files', '--others', '--exclude-standard', '-z']),
      ]);
      const base = head.trim() || (await runGit(root, env, ['hash-object', '-t', 'tree', '/dev/null'])).trim();
      const tracked = parseTrackedFiles(await runGit(root, env, [
        'diff', ...DIFF_FLAGS, '--no-relative', '--ignore-submodules=dirty', '--submodule=short',
        '--raw', '--no-abbrev', '-z', '--patch', base, '--',
      ]));
      const untracked = others.split('\0').filter(Boolean);
      const trackedByPath = new Map(tracked.map((file) => [file.path, file]));
      if (new Set([...trackedByPath.keys(), ...untracked]).size > MAX_FILES) throw new ReviewTooLarge();

      const files = new Map(tracked.map(({ path, diff }) => [path, diff]));
      let totalBytes = Buffer.byteLength(JSON.stringify([...files.values()]));
      if (totalBytes > MAX_DIFF_BYTES) throw new ReviewTooLarge();
      for (let offset = 0; offset < untracked.length; offset += 8) {
        const batch = await Promise.all(untracked.slice(offset, offset + 8).map(async (path) => ({
          path, diff: await readUntracked(root, env, path, trackedByPath.get(path)),
        })));
        for (const { path, diff } of batch) {
          if (diff) {
            totalBytes += Buffer.byteLength(JSON.stringify(diff));
            if (totalBytes > MAX_DIFF_BYTES) throw new ReviewTooLarge();
            files.set(path, diff);
          } else {
            files.delete(path);
          }
        }
      }
      if (!files.size) return { ok: false, error: 'empty' };

      return {
        ok: true,
        review: createReview({
          sourceAddress: pathToFileURL(root).href,
          project: basename(root).trim() || root,
          reference: 'Локальный Git',
          title: 'Незакоммиченные изменения',
          sourceBranch: branch.trim() || 'Рабочая копия',
          targetBranch: head ? 'HEAD' : 'Пустое дерево',
        }, [...files.values()]),
      };
    } catch (error) {
      const failure = error as CommandError;
      if (error instanceof GitMissing) return { ok: false, error: 'git-missing' };
      if (failure.code === 128 && /not a git repository|must be run in a work tree/.test(failure.stderr ?? '')) {
        return { ok: false, error: 'not-repository' };
      }
      if (error instanceof ReviewTooLarge) return { ok: false, error: 'too-large' };
      return { ok: false, error: 'read-failed' };
    }
  }
}
