import ts from 'typescript';
import {
  FORMATTING_AND_COMMENTS_FILTER,
  type FileFilter,
  type FileFilterInput,
  type FileFilterResult,
} from '../domain/file-filter';
import type { DiffHunk } from '../domain/review';

const MAX_SOURCE_LENGTH = 32_000;
const SCRIPT_PATH = /\.[cm]?[jt]s$/i;
const JSON_PATH = /\.json$/i;
const TOOL_COMMENT =
  /@[\w-]+|\b(?:eslint|tslint|prettier|biome|oxlint|stylelint|jshint|jslint|lint|deno-(?:lint|fmt)|dprint|fall[ -]?through|istanbul|c8|nyc|v8|noqa|nolint|noinspection|sourceURL|sourceMappingURL|webpack\w*|codegen|coverage)\b/i;

type ParsedSource = ts.SourceFile & { readonly parseDiagnostics: readonly ts.Diagnostic[] };

function readPrefix(hunks: readonly DiffHunk[]): { before: string; after: string } | undefined {
  if (hunks.length !== 1) return;

  const { lines } = hunks[0];
  if (lines.find((line) => line.oldLine !== null)?.oldLine !== 1 ||
      lines.find((line) => line.newLine !== null)?.newLine !== 1) {
    return;
  }

  const before = lines.filter((line) => line.marker !== '+').map((line) => line.text).join('\n');
  const after = lines.filter((line) => line.marker !== '-').map((line) => line.text).join('\n');
  if (before.length <= MAX_SOURCE_LENGTH && after.length <= MAX_SOURCE_LENGTH) return { before, after };
  return undefined;
}

function jsonTokens(source: string): string[] {
  JSON.parse(source);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, source);
  const tokens: string[] = [];
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) tokens.push(scanner.getTokenText());
  return tokens;
}

function syntaxChildren(node: ts.Node, source: ts.SourceFile): readonly ts.Node[] {
  const children = node.getChildren(source).filter((child) => !ts.isJSDoc(child));
  if (node.kind !== ts.SyntaxKind.SyntaxList || children.at(-1)?.kind !== ts.SyntaxKind.CommaToken) {
    return children;
  }

  // A trailing comma is optional for these literals, except when it denotes an array hole.
  const parent = node.parent;
  if (ts.isObjectLiteralExpression(parent) ||
      (ts.isArrayLiteralExpression(parent) && parent.elements.at(-1)?.kind !== ts.SyntaxKind.OmittedExpression)) {
    return children.slice(0, -1);
  }
  return children;
}

function sameSyntax(before: ts.SourceFile, after: ts.SourceFile): boolean {
  const pending: Array<[ts.Node, ts.Node]> = [[before, after]];
  while (pending.length) {
    const [oldNode, newNode] = pending.pop()!;
    if (oldNode.kind !== newNode.kind) return false;

    const oldChildren = syntaxChildren(oldNode, before);
    const newChildren = syntaxChildren(newNode, after);
    if (oldChildren.length !== newChildren.length) return false;
    if (oldChildren.length === 0 && oldNode.getText(before) !== newNode.getText(after)) return false;

    for (let index = 0; index < oldChildren.length; index++) {
      pending.push([oldChildren[index], newChildren[index]]);
    }
  }
  return true;
}

function readTrivia(source: string): string[] | undefined {
  if (!source.trim()) return [];

  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  const comments: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      if (scanner.isUnterminated()) return;
      comments.push(scanner.getTokenText());
    } else if (kind !== ts.SyntaxKind.WhitespaceTrivia && kind !== ts.SyntaxKind.NewLineTrivia) {
      return;
    }
  }
  return comments;
}

function inspectScript(source: ts.SourceFile): string[] | undefined {
  const pending: ts.Node[] = [source];
  const comments: string[] = [];
  let position = 0;
  let tokenIndex = 0;
  let lastToken: ts.SyntaxKind | undefined;

  // Use parser token boundaries. Characters inside literals are never scanned as comment trivia.
  const collect = (end: number): boolean => {
    const trivia = readTrivia(source.text.slice(position, end));
    if (!trivia) return false;
    comments.push(...trivia.map((comment) => `${tokenIndex}:${comment}`));
    return true;
  };

  while (pending.length) {
    const node = pending.pop()!;
    const children = node.getChildren(source).filter((child) => !ts.isJSDoc(child));
    if (children.length) {
      for (let index = children.length - 1; index >= 0; index--) pending.push(children[index]);
      continue;
    }

    const start = node.getStart(source);
    if (node.end <= start) continue;
    if (start < position || !collect(start)) return;

    position = node.end;
    tokenIndex++;
    lastToken = node.kind;
  }

  const lastStatement = source.statements.at(-1);
  const closedDeclaration = lastToken === ts.SyntaxKind.CloseBraceToken && lastStatement &&
    (ts.isFunctionDeclaration(lastStatement) || ts.isClassDeclaration(lastStatement) ||
      ts.isInterfaceDeclaration(lastStatement) || ts.isEnumDeclaration(lastStatement));
  // Compare a prefix ending at a statement boundary, or a prefix containing only comments.
  if (lastToken !== undefined && lastToken !== ts.SyntaxKind.SemicolonToken && !closedDeclaration) return;
  return collect(source.end) ? comments : undefined;
}

function controlsTools(comment: string): boolean {
  const text = comment.slice(comment.indexOf(':') + 1);
  return text.startsWith('///') || text.startsWith('/*!') || TOOL_COMMENT.test(text) ||
    /^\s*\*?\s*(?:[#$%!]|(?:global|exported)\s+|[a-z][\w.-]*(?::|=)\S)/im.test(text.slice(2));
}

function equalStrings(before: readonly string[], after: readonly string[]): boolean {
  return before.length === after.length && before.every((value, index) => value === after[index]);
}

function inspectScriptChange(path: string, before: string, after: string): FileFilterResult {
  const oldSource = ts.createSourceFile(path, before, ts.ScriptTarget.Latest, true) as ParsedSource;
  const newSource = ts.createSourceFile(path, after, ts.ScriptTarget.Latest, true) as ParsedSource;
  if (oldSource.parseDiagnostics.length || newSource.parseDiagnostics.length) {
    return { outcome: 'unknown', reason: 'Не удалось разобрать код' };
  }

  const oldComments = inspectScript(oldSource);
  const newComments = inspectScript(newSource);
  if (!oldComments || !newComments) return { outcome: 'unknown', reason: 'Недостаточно контекста для сравнения кода' };
  if (oldComments.some(controlsTools) || newComments.some(controlsTools)) {
    return { outcome: 'unknown', reason: 'Есть комментарии, которые могут управлять инструментами' };
  }
  if (!sameSyntax(oldSource, newSource)) return { outcome: 'no-match', reason: 'Изменился код' };
  if (equalStrings(oldComments, newComments)) return { outcome: 'match', reason: 'Только форматирование' };

  return { outcome: 'match', reason: 'Правки обычных комментариев' };
}

export class FormattingAndCommentsFilter implements FileFilter {
  readonly id = FORMATTING_AND_COMMENTS_FILTER;

  evaluate({ file, diffComplete }: FileFilterInput): FileFilterResult {
    if (!diffComplete) return { outcome: 'unknown', reason: 'Diff неполный' };
    if (file.structuralChange) return { outcome: 'no-match', reason: 'Изменилась структура файла' };

    const json = JSON_PATH.test(file.path);
    if (!json && !SCRIPT_PATH.test(file.path)) return { outcome: 'unknown', reason: 'Формат файла неизвестен фильтру' };

    const prefix = readPrefix(file.hunks);
    if (!prefix) return { outcome: 'unknown', reason: 'Недостаточно контекста в diff' };
    const { before, after } = prefix;
    if (before === after) return { outcome: 'unknown', reason: 'Тип правки не удалось определить' };

    try {
      if (!json) return inspectScriptChange(file.path, before, after);
      return equalStrings(jsonTokens(before), jsonTokens(after))
        ? { outcome: 'match', reason: 'Только форматирование JSON' }
        : { outcome: 'no-match', reason: 'Изменились данные JSON' };
    } catch {
      return { outcome: 'unknown', reason: 'Не удалось разобрать изменения' };
    }
  }
}
