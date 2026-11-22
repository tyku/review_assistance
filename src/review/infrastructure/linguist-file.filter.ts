import { basename } from 'node:path/posix';
import { LINGUIST_FILE_FILTER, type FileFilter, type FileFilterInput, type FileFilterResult } from '../domain/file-filter';

type Language = import('linguist-languages', { with: { 'resolution-mode': 'import' } }).Language;

function addLanguage(index: Map<string, Language[]>, key: string, language: Language): void {
  const matches = index.get(key) ?? [];
  matches.push(language);
  index.set(key, matches);
}

async function loadCatalog() {
  const filenames = new Map<string, Language[]>();
  const extensions = new Map<string, Language[]>();
  const foldedExtensions = new Map<string, Language[]>();
  const languages: readonly Language[] = Object.values(await import('linguist-languages'));
  for (const language of languages) {
    for (const name of language.filenames ?? []) addLanguage(filenames, name, language);
    for (const extension of language.extensions ?? []) {
      addLanguage(extensions, extension, language);
      addLanguage(foldedExtensions, extension.toLowerCase(), language);
    }
  }
  return { filenames, extensions, foldedExtensions };
}

export class LinguistFileFilter implements FileFilter {
  readonly id = LINGUIST_FILE_FILTER;
  private catalog?: ReturnType<typeof loadCatalog>;

  async evaluate({ file }: FileFilterInput): Promise<FileFilterResult> {
    const catalog = await (this.catalog ??= loadCatalog());
    const name = basename(file.path);
    const candidates = catalog.filenames.get(name);
    if (candidates) return classify(candidates);
    for (let dot = name.indexOf('.'); dot !== -1; dot = name.indexOf('.', dot + 1)) {
      const suffix = name.slice(dot);
      const languages = catalog.extensions.get(suffix) ?? catalog.foldedExtensions.get(suffix.toLowerCase());
      if (languages) return classify(languages, suffix);
    }
    return { outcome: 'match', reason: 'Формат отсутствует в каталоге Linguist' };
  }
}

function classify(candidates: readonly Language[], suffix?: string): FileFilterResult {
  const programming = candidates.filter(({ type }) => type === 'programming');
  const possibleLanguages = programming.length ? programming : candidates;
  const names = new Set(possibleLanguages.map((language) => language.group ?? language.name));
  const primary = suffix ? possibleLanguages.filter((language) => language.extensions?.[0] === suffix) : [];
  const familiarFormat = !programming.length && suffix
    ? candidates.find(({ name, aliases }) =>
      [name.toLowerCase(), ...(aliases ?? [])].includes(suffix.slice(1).toLowerCase()))
    : undefined;
  const preferred = familiarFormat ?? (primary.length === 1 ? primary[0] : undefined);
  const detectedLanguage = preferred ? preferred.group ?? preferred.name : names.size === 1 ? [...names][0] : undefined;
  if (programming.length) {
    return { outcome: 'no-match', reason: 'Язык программирования', detectedLanguage };
  }

  const category = candidates.every(({ type }) => type === 'data') ? 'Формат данных'
    : candidates.every(({ type }) => type === 'prose') ? 'Текстовый формат'
    : candidates.every(({ type }) => type === 'markup') ? 'Разметка'
    : 'В каталоге нет языка программирования для этого формата';
  return { outcome: 'match', reason: detectedLanguage ? `${category} · ${detectedLanguage}` : category, detectedLanguage };
}
