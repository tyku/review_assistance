import type { DiffHunk, DiffLine } from '../domain/review';

interface PendingHunk {
  header: string;
  lines: DiffLine[];
  oldLine: number;
  newLine: number;
  oldEnd: number;
  newEnd: number;
}

export function parseUnifiedDiff(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let pending: PendingHunk | undefined;

  function finishHunk() {
    if (!pending) return;
    if (pending.oldLine !== pending.oldEnd || pending.newLine !== pending.newEnd) {
      throw new Error('Diff hunk length does not match its header');
    }
    hunks.push({ header: pending.header, lines: pending.lines });
  }

  for (const line of patch.split('\n')) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(line);
    if (header) {
      finishHunk();
      const oldLine = Number(header[1]);
      const newLine = Number(header[3]);
      pending = {
        header: line,
        lines: [],
        oldLine,
        newLine,
        oldEnd: oldLine + Number(header[2] ?? 1),
        newEnd: newLine + Number(header[4] ?? 1),
      };
      continue;
    }

    const marker = line[0];
    if (!pending || (marker !== ' ' && marker !== '-' && marker !== '+')) {
      throw new Error('Invalid diff line');
    }
    pending.lines.push({
      marker,
      oldLine: marker === '+' ? null : pending.oldLine++,
      newLine: marker === '-' ? null : pending.newLine++,
      text: line.slice(1),
    });
  }

  finishHunk();
  return hunks;
}
