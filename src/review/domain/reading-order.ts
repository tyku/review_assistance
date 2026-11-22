import { posix } from 'node:path';
import type { FileDiff } from './review';

type ReadingFile = Pick<FileDiff, 'path'> & Partial<Pick<FileDiff, 'hunks'>>;
type ReadingEntry = ReturnType<typeof identifyFile> & { path: string; index: number };

const scriptExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const relativeImport = /^\s*(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+)['"](\.{1,2}\/[^'"]+)['"]/;

function identifyFile(path: string): { name: string; step: number } {
  const parts = path.toLowerCase().split('/');
  const filename = parts.pop() ?? '';
  const stem = filename.replace(/\.[^.]+$/, '');
  const suffix = /[._-](controller|service|repository|repo|spec|test)$/.exec(stem);
  const feature = suffix ? stem.slice(0, suffix.index) : stem;
  const scope = parts.filter((part) => !/^(?:src|controllers?|services?|repositories|tests?|specs?|__tests__)$/.test(part));
  const extension = scriptExtension.test(filename) ? 'js' : filename.slice(stem.length);
  const name = [...scope, `${feature}:${extension}`].join('/');

  if (parts.some((part) => /^(?:tests?|specs?|__tests__)$/.test(part))) return { name, step: 3 };
  switch (suffix?.[1]) {
    case 'controller': return { name, step: 0 };
    case 'repository':
    case 'repo': return { name, step: 2 };
    case 'spec':
    case 'test': return { name, step: 3 };
    default: return { name, step: 1 };
  }
}

function readImports(file: ReadingFile, paths: ReadonlySet<string>): Set<string> {
  const imports = new Set<string>();
  if (!scriptExtension.test(file.path)) return imports;

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
  for (const hunk of file.hunks ?? []) {
    for (const line of hunk.lines) {
      if (line.marker === '-') continue;
      const specifier = relativeImport.exec(line.text)?.[1];
      if (!specifier) continue;

      const base = posix.normalize(posix.join(posix.dirname(file.path), specifier));
      const stem = base.replace(/\.[cm]?jsx?$/, '');
      const candidates = paths.has(base) ? [base] : extensions
        .flatMap((extension) => [stem + extension, posix.join(base, 'index' + extension)])
        .filter((path) => paths.has(path));
      if (candidates.length === 1 && candidates[0] !== file.path) imports.add(candidates[0]);
    }
  }
  return imports;
}

function orderComponent(component: ReadingEntry[], imports: ReadonlyMap<string, Set<string>>): string[] {
  const result: string[] = [];
  for (const step of [0, 1, 2, 3]) {
    const paths = component.filter((entry) => entry.step === step).map((entry) => entry.path);
    const incoming = new Map(paths.map((path) => [path, 0]));
    for (const path of paths) {
      for (const target of imports.get(path) ?? []) {
        const count = incoming.get(target);
        if (count !== undefined) incoming.set(target, count + 1);
      }
    }

    const ready = paths.filter((path) => incoming.get(path) === 0);
    for (const path of ready) {
      result.push(path);
      for (const target of imports.get(path) ?? []) {
        const count = incoming.get(target);
        if (count === undefined) continue;
        incoming.set(target, count - 1);
        if (count === 1) ready.push(target);
      }
    }
    // Imports can form cycles. Keep their source order when no next file is implied.
    result.push(...paths.filter((path) => (incoming.get(path) ?? 0) > 0));
  }
  return result;
}

export function buildReadingOrder(files: readonly ReadingFile[]): string[] {
  const entries = files.map(({ path }, index) => ({ path, index, ...identifyFile(path) }));
  const paths = new Set(entries.map(({ path }) => path));
  const imports = new Map(files.map((file) => [file.path, readImports(file, paths)]));
  const neighbors = new Map(entries.map((entry) => [entry.path, new Set<string>()]));
  const connect = (left: string, right: string) => {
    neighbors.get(left)?.add(right);
    neighbors.get(right)?.add(left);
  };

  for (const [source, targets] of imports) {
    for (const target of targets) connect(source, target);
  }

  const byName = new Map<string, ReadingEntry[]>();
  for (const entry of entries) {
    const group = byName.get(entry.name);
    if (group) group.push(entry);
    else byName.set(entry.name, [entry]);
  }

  for (const group of byName.values()) {
    if (group.length < 2 || !group.some(({ step }) => step !== 1)) continue;
    for (const entry of group.slice(1)) connect(group[0].path, entry.path);
  }

  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const seen = new Set<string>();
  const order: string[] = [];
  const testOnly: string[] = [];
  for (const entry of entries) {
    if (seen.has(entry.path)) continue;
    const component = [entry];
    seen.add(entry.path);
    for (const { path } of component) {
      for (const neighbor of neighbors.get(path) ?? []) {
        const linked = byPath.get(neighbor);
        if (!linked || seen.has(neighbor)) continue;
        seen.add(neighbor);
        component.push(linked);
      }
    }
    component.sort((left, right) => left.index - right.index);
    const destination = component.every((member) => member.step === 3) ? testOnly : order;
    destination.push(...orderComponent(component, imports));
  }
  return [...order, ...testOnly];
}
