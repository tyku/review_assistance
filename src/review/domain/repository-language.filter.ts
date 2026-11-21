import { REPOSITORY_LANGUAGE_FILTER, type FileFilter, type FileFilterInput, type FileFilterResult } from './file-filter';

const languageByExtension: Readonly<Record<string, string>> = {
  c: 'C', cc: 'C++', cpp: 'C++', cxx: 'C++', hpp: 'C++', cs: 'C#',
  css: 'CSS', dart: 'Dart', ex: 'Elixir', exs: 'Elixir', erl: 'Erlang',
  go: 'Go', groovy: 'Groovy', html: 'HTML', java: 'Java',
  js: 'JavaScript', jsx: 'JavaScript', cjs: 'JavaScript', mjs: 'JavaScript',
  json: 'JSON', kt: 'Kotlin', kts: 'Kotlin', lua: 'Lua', php: 'PHP',
  ps1: 'PowerShell', py: 'Python', rb: 'Ruby', rs: 'Rust', scala: 'Scala',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell', sql: 'SQL', svelte: 'Svelte',
  swift: 'Swift', toml: 'TOML', ts: 'TypeScript', tsx: 'TypeScript',
  cts: 'TypeScript', mts: 'TypeScript', vue: 'Vue', xml: 'XML', yaml: 'YAML', yml: 'YAML',
};

const languageByFilename: Readonly<Record<string, string>> = {
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
};

export class RepositoryLanguageFilter implements FileFilter {
  readonly id = REPOSITORY_LANGUAGE_FILTER;

  evaluate({ file, repositoryLanguages }: FileFilterInput): FileFilterResult {
    if (!repositoryLanguages?.length) return { outcome: 'unknown', reason: 'Нет списка языков репозитория' };

    const basename = file.path.slice(file.path.lastIndexOf('/') + 1).toLowerCase();
    const extension = /\.([a-z0-9]+)$/.exec(basename)?.[1] ?? '';
    const language = Object.hasOwn(languageByFilename, basename) ? languageByFilename[basename]
      : Object.hasOwn(languageByExtension, extension) ? languageByExtension[extension] : undefined;
    if (!language) return { outcome: 'unknown', reason: 'Язык файла не распознан' };
    if (repositoryLanguages.some((name) => name.trim().toLowerCase() === language.toLowerCase())) {
      return { outcome: 'match', reason: language };
    }
    return { outcome: 'no-match', reason: `${language} отсутствует в списке языков репозитория` };
  }
}
