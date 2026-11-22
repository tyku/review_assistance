type ScreenReview = import('../../review/domain/review').Review;
type ScreenFile = import('../../review/domain/review').ChangedFile;
type FilterIds = typeof import('../../review/domain/file-filter');
type LanguageSortingStatus = import('../../review/application/linked-review').LanguageSortingStatus;

interface FileEntry {
  file: ScreenFile;
  entry: HTMLLIElement;
  button: HTMLButtonElement;
}

interface Window {
  readonly review: import('./review-ipc').ReviewBridge;
}

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error('Missing UI element: ' + id);
  return node;
}
const welcome = byId('welcome');
const reviewScreen = byId('review');
const openButton = byId('open') as HTMLButtonElement;
const backButton = byId('back');
const errorMessage = byId('error');
const fileList = byId('files');
const diffScroll = byId('diff-scroll');
const nextFileButton = byId('next-file') as HTMLButtonElement;
const readingPosition = byId('reading-position');

let selectedButton: HTMLButtonElement | undefined;

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className?: string,
  value?: string | number | null,
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = String(value);
  return node;
}

function stats(file: ScreenFile) {
  if (file.added === undefined || file.removed === undefined) return [];
  const added = element('span', 'added', '+' + file.added);
  added.setAttribute('aria-label', 'Добавлено строк: ' + file.added);
  const removed = element('span', 'removed', '−' + file.removed);
  removed.setAttribute('aria-label', 'Удалено строк: ' + file.removed);
  return [added, removed];
}

function showDiff(file: ScreenFile, button: HTMLButtonElement, source: string) {
  if (button === selectedButton) return;
  selectedButton?.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-pressed', 'true');
  selectedButton = button;

  byId('diff-title').textContent = file.path;
  byId('diff-stats').replaceChildren(...stats(file));
  if (file.unavailable) {
    diffScroll.replaceChildren(element('p', 'diff-unavailable', `${source} не вернул полный diff этого файла.`));
    return;
  }

  const table = element('table', 'diff-table');
  const labels = element('tr');
  for (const label of ['До', 'После', 'Правка', 'Код']) {
    const heading = element('th', '', label);
    heading.scope = 'col';
    labels.append(heading);
  }
  table.createTHead().append(labels);

  for (const hunk of file.hunks) {
    const body = table.createTBody();
    const headerRow = body.insertRow();
    headerRow.className = 'hunk-header';
    const header = headerRow.insertCell();
    header.colSpan = 4;
    header.textContent = hunk.header;

    for (const line of hunk.lines) {
      const row = body.insertRow();
      if (line.marker === '+') row.className = 'added-line';
      if (line.marker === '-') row.className = 'removed-line';
      row.append(
        element('td', 'line-number', line.oldLine),
        element('td', 'line-number', line.newLine),
        element('td', 'line-marker', line.marker),
        element('td', 'line-source', line.text),
      );
    }
  }

  diffScroll.replaceChildren(table);
  diffScroll.scrollTo(0, 0);
}

function fileGroup(label: string, entries: HTMLLIElement[], expanded: boolean): HTMLLIElement {
  const group = element('li', 'file-group');
  const details = element('details');
  details.open = expanded;

  const summary = element('summary', '', label);
  summary.prepend(element('span', 'file-count', entries.length));

  const list = element('ul', 'file-group-list');
  list.append(...entries);
  details.append(summary, list);
  group.append(details);
  return group;
}

function showReview(example: ScreenReview, linkedReview?: {
  source: string;
  incomplete: boolean;
  languageSorting?: LanguageSortingStatus;
}) {
  const { source = 'Сервис', incomplete, languageSorting } = linkedReview ?? {};
  const languageMode = languageSorting === 'available';
  const messages: string[] = [];
  if (incomplete) messages.push(`${source} вернул неполные изменения. Некоторые файлы или строки могут отсутствовать.`);
  if (languageSorting === 'empty') messages.push('У репозитория пока нет статистики языков. Используется обычная сортировка.');
  if (languageSorting === 'forbidden') messages.push('GitLab не дал доступ к списку языков. Используется обычная сортировка.');
  if (languageSorting === 'unavailable') messages.push('Не удалось загрузить языки репозитория. Используется обычная сортировка.');
  const notice = byId('diff-notice');
  notice.textContent = messages.join(' ');
  notice.hidden = messages.length === 0;
  byId('project').textContent = example.project;
  byId('reference').textContent = example.reference;
  byId('review-title').textContent = example.title;
  byId('source-branch').textContent = example.sourceBranch;
  byId('target-branch').textContent = example.targetBranch;
  byId('file-count').textContent = String(example.files.length);
  selectedButton = undefined;

  const primary: FileEntry[] = [];
  const tests: FileEntry[] = [];
  const formatting: FileEntry[] = [];
  const other: FileEntry[] = [];
  const entriesByPath = new Map<string, FileEntry>();

  const extensionRule = { id: 'other-extension' satisfies FilterIds['OTHER_EXTENSION_FILTER'], entries: other };
  const testRule = { id: 'test-path' satisfies FilterIds['TEST_PATH_FILTER'], entries: tests };
  const formattingRule = { id: 'formatting-and-comments' satisfies FilterIds['FORMATTING_AND_COMMENTS_FILTER'], entries: formatting };
  const groupingRules = languageMode
    ? [extensionRule, formattingRule, testRule]
    : [extensionRule, testRule, formattingRule];
  const languageFilterId: FilterIds['REPOSITORY_LANGUAGE_FILTER'] = 'repository-language';

  for (const file of example.files) {
    const entry = element('li');
    const button = element('button', 'file-button');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');

    const lastSlash = file.path.lastIndexOf('/');
    const name = element('span', 'file-name', file.path.slice(lastSlash + 1));
    const details = element('span', 'file-details');
    const directory = element('span', 'directory', file.path.slice(0, lastSlash + 1));
    const counts = element('span', 'stats');
    counts.append(...stats(file));
    details.append(directory, counts);
    button.append(name, details);
    const target = groupingRules.find(({ id }) =>
      file.filterResults?.some((result) => result.filterId === id && result.outcome === 'match'),
    );
    const language = file.filterResults?.find((result) => result.filterId === languageFilterId);
    const fallback = languageMode && language?.outcome !== 'match' ? other : primary;
    let reason = file.filterResults?.find((result) => result.filterId === target?.id)?.reason;
    if (languageMode && target === testRule) reason = 'Тест';
    if (!target && fallback === other) reason = language?.reason ?? 'Язык файла не распознан';
    if (reason) button.append(element('span', 'file-reason', reason));
    entry.append(button);
    const fileEntry = { file, entry, button };
    entriesByPath.set(file.path, fileEntry);
    (target?.entries ?? fallback).push(fileEntry);
  }

  fileList.replaceChildren();
  const groups = [
    { label: languageMode ? 'Основное' : 'К просмотру', entries: primary, expanded: true },
    { label: 'Тесты', entries: tests, expanded: true },
    { label: 'Только оформление и комментарии', entries: formatting, expanded: false },
    { label: languageMode ? 'Остальное' : 'Прочее', entries: other, expanded: false },
  ];
  if (linkedReview) {
    const rank = new Map(example.readingOrder.map((path, index) => [path, index]));
    for (const { entries } of groups) {
      entries.sort((left, right) => rank.get(left.file.path)! - rank.get(right.file.path)!);
    }
  }
  for (const { label, entries, expanded } of groups) {
    if (entries.length > 0) fileList.append(fileGroup(label, entries.map(({ entry }) => entry), expanded));
  }
  welcome.hidden = true;
  reviewScreen.hidden = false;
  fileList.scrollTo(0, 0);
  backButton.hidden = false;
  const queue = linkedReview ? groups.flatMap(({ entries }) => entries.map(({ file }) => file.path)) : example.readingOrder;
  let position = 0;
  function selectFile(fileEntry: FileEntry, index: number) {
    position = index;
    readingPosition.textContent = `${position + 1} из ${queue.length}`;
    nextFileButton.disabled = position === queue.length - 1;
    showDiff(fileEntry.file, fileEntry.button, source);
  }

  function openQueueFile(index: number) {
    const fileEntry = entriesByPath.get(queue[index]);
    if (!fileEntry) return;
    const group = fileEntry.entry.closest('details');
    if (group) group.open = true;
    selectFile(fileEntry, index);
    fileEntry.button.scrollIntoView({ block: 'nearest' });
  }

  queue.forEach((path, index) => {
    entriesByPath.get(path)?.button.addEventListener('click', () => openQueueFile(index));
  });
  nextFileButton.onclick = () => openQueueFile(position + 1);
  openQueueFile(0);
  byId('review-title').focus();
}

openButton.addEventListener('click', async () => {
  openButton.disabled = true;
  errorMessage.hidden = true;

  try {
    const result = await window.review.openExample();
    if (!result.ok) throw new Error('Example unavailable');
    showReview(result.example);
  } catch {
    errorMessage.textContent = 'Не удалось открыть учебный MR. Проверьте, что файл fixtures/example.json на месте и не повреждён, затем попробуйте снова.';
    errorMessage.hidden = false;
  } finally {
    openButton.disabled = false;
    if (!welcome.hidden) openButton.focus();
  }
});

backButton.addEventListener('click', () => {
  reviewScreen.hidden = true;
  backButton.hidden = true;
  welcome.hidden = false;
  openButton.focus();
});
