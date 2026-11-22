type ScreenReview = import('../../review/domain/review').Review;
type ScreenFile = import('../../review/domain/review').ChangedFile;
type FilterIds = typeof import('../../review/domain/file-filter');
type FileProgress = import('../../review/application/review-progress').FileProgress;
type ReviewProgressSnapshot = import('../../review/application/review-progress').ReviewProgressSnapshot;

interface FileEntry {
  file: ScreenFile;
  entry: HTMLLIElement;
  button: HTMLButtonElement;
  visitCount: HTMLSpanElement;
  viewedMark: HTMLSpanElement;
  progress?: FileProgress;
  savingViewed?: boolean;
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
const openLocalButton = byId('open-local') as HTMLButtonElement;
const backButton = byId('back');
const errorMessage = byId('error');
const fileList = byId('files');
const diffScroll = byId('diff-scroll');
const diffToggle = byId('diff-toggle');
const diffPath = byId('diff-path');
const nextFileButton = byId('next-file') as HTMLButtonElement;
const readingPosition = byId('reading-position');
const viewedControl = byId('file-viewed') as HTMLInputElement;
const progressNotice = byId('progress-notice');

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

function setDiffExpanded(expanded: boolean) {
  diffScroll.hidden = !expanded;
  diffToggle.setAttribute('aria-expanded', String(expanded));
}

diffToggle.addEventListener('click', () => setDiffExpanded(diffScroll.hidden));

function showDiff(file: ScreenFile, button: HTMLButtonElement, source: string) {
  if (button === selectedButton) return;
  selectedButton?.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-pressed', 'true');
  selectedButton = button;

  diffPath.textContent = file.path;
  diffScroll.hidden = false;
  byId('diff-stats').replaceChildren(...stats(file));
  if (file.unavailable) {
    const message = file.unavailable.reason === 'binary' ? 'Бинарный файл. Текстовый diff недоступен.'
      : `${source} не вернул полный diff этого файла.`;
    diffScroll.replaceChildren(element('p', 'diff-unavailable', message));
    return;
  }
  if (file.hunks.length === 0) {
    diffScroll.replaceChildren(element('p', 'diff-unavailable', 'В этом изменении нет строк для показа.'));
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

function showReview(example: ScreenReview, progress?: ReviewProgressSnapshot, linkedReview?: {
  source: string;
  incomplete: boolean;
}) {
  const { source = 'Сервис', incomplete } = linkedReview ?? {};
  const notice = byId('diff-notice');
  notice.textContent = incomplete ? `${source} вернул неполные изменения. Некоторые файлы или строки могут отсутствовать.` : '';
  notice.hidden = !incomplete;
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
  const progressByPath = new Map(progress?.files.map((file) => [file.path, file]));
  progressNotice.hidden = progress !== undefined;
  progressNotice.textContent = 'Не удалось загрузить прогресс. Откройте ревью заново, чтобы повторить.';

  const extensionRule = { id: 'other-extension' satisfies FilterIds['OTHER_EXTENSION_FILTER'], entries: other };
  const testRule = { id: 'test-path' satisfies FilterIds['TEST_PATH_FILTER'], entries: tests };
  const formattingRule = { id: 'formatting-and-comments' satisfies FilterIds['FORMATTING_AND_COMMENTS_FILTER'], entries: formatting };
  const linguistRule = { id: 'linguist-file' satisfies FilterIds['LINGUIST_FILE_FILTER'], entries: other };
  const groupingRules = [extensionRule, testRule, formattingRule, linguistRule];

  for (const file of example.files) {
    const entry = element('li');
    const button = element('button', 'file-button');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');

    const lastSlash = file.path.lastIndexOf('/');
    const name = element('span', 'file-name', file.path.slice(lastSlash + 1));
    const visitCount = element('span', 'file-visit-count');
    const viewedMark = element('span', 'file-viewed-mark', '✓');
    viewedMark.setAttribute('aria-label', 'Просмотрен');
    const fileLabel = element('span', 'file-label');
    fileLabel.append(name, visitCount, viewedMark);
    const details = element('span', 'file-details');
    const directory = element('span', 'directory', file.path.slice(0, lastSlash + 1));
    const counts = element('span', 'stats');
    counts.append(...stats(file));
    details.append(directory, counts);
    button.append(fileLabel, details);
    const target = groupingRules.find(({ id }) =>
      file.filterResults?.some((result) => result.filterId === id && result.outcome === 'match'),
    );
    const reason = target === testRule ? 'Тест' :
      file.filterResults?.find((result) => result.filterId === target?.id)?.reason;
    if (reason) button.append(element('span', 'file-reason', reason));
    entry.append(button);
    const fileEntry = { file, entry, button, visitCount, viewedMark, progress: progressByPath.get(file.path) };
    updateFileProgress(fileEntry);
    entriesByPath.set(file.path, fileEntry);
    (target?.entries ?? primary).push(fileEntry);
  }

  fileList.replaceChildren();
  const groups = [
    { label: 'Основное', entries: primary, expanded: true },
    { label: 'Тесты', entries: tests, expanded: true },
    { label: 'Только оформление и комментарии', entries: formatting, expanded: false },
    { label: 'Остальное', entries: other, expanded: false },
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

  function updateFileProgress(fileEntry: FileEntry) {
    const opens = fileEntry.progress?.opens ?? 0;
    fileEntry.visitCount.textContent = `×${opens}`;
    fileEntry.visitCount.setAttribute('aria-label', `Открытий: ${opens}`);
    fileEntry.visitCount.hidden = opens < 2;
    fileEntry.viewedMark.hidden = !fileEntry.progress?.viewed;
  }

  function updateViewedControl(fileEntry: FileEntry) {
    viewedControl.checked = fileEntry.progress?.viewed ?? false;
    viewedControl.disabled = !fileEntry.progress || Boolean(fileEntry.savingViewed);
  }

  async function saveProgress(fileEntry: FileEntry, viewed?: boolean) {
    if (!progress || !fileEntry.progress) return;
    if (viewed !== undefined) {
      fileEntry.savingViewed = true;
      viewedControl.disabled = true;
    }
    try {
      const result = await window.review.updateProgress(progress.key, fileEntry.file.path, fileEntry.progress.fingerprint, viewed);
      if (!result.ok) throw new Error('Progress not saved');
      fileEntry.progress = result.fileProgress;
      updateFileProgress(fileEntry);
      if (fileList.contains(fileEntry.entry)) progressNotice.hidden = true;
      if (viewed !== undefined && selectedButton === fileEntry.button) setDiffExpanded(!result.fileProgress.viewed);
    } catch {
      if (fileList.contains(fileEntry.entry)) {
        progressNotice.textContent = 'Не удалось сохранить прогресс. Повторите действие или откройте ревью заново.';
        progressNotice.hidden = false;
      }
    } finally {
      if (viewed !== undefined) fileEntry.savingViewed = false;
      if (selectedButton === fileEntry.button) updateViewedControl(fileEntry);
    }
  }

  function openQueueFile(index: number, countOpening = true) {
    const fileEntry = entriesByPath.get(queue[index]);
    if (!fileEntry || selectedButton === fileEntry.button) return;
    const group = fileEntry.entry.closest('details');
    if (group) group.open = true;
    position = index;
    readingPosition.textContent = `${position + 1} из ${queue.length}`;
    nextFileButton.disabled = position === queue.length - 1;
    showDiff(fileEntry.file, fileEntry.button, source);
    setDiffExpanded(!fileEntry.progress?.viewed);
    updateViewedControl(fileEntry);
    if (countOpening) void saveProgress(fileEntry);
    fileEntry.button.scrollIntoView({ block: 'nearest' });
  }

  queue.forEach((path, index) => {
    entriesByPath.get(path)?.button.addEventListener('click', () => openQueueFile(index));
  });
  nextFileButton.onclick = () => openQueueFile(position + 1);
  viewedControl.onchange = () => {
    const fileEntry = entriesByPath.get(queue[position]);
    if (fileEntry) void saveProgress(fileEntry, viewedControl.checked);
  };
  const restoredIndex = progress?.restoredPath ? queue.indexOf(progress.restoredPath) : -1;
  openQueueFile(Math.max(0, restoredIndex), !progress?.hasOpenedFile);
  byId('review-title').focus();
}

function setOpeningReview(busy: boolean) {
  openButton.disabled = busy;
  openLocalButton.disabled = busy;
}

openButton.addEventListener('click', async () => {
  setOpeningReview(true);
  errorMessage.hidden = true;

  try {
    const result = await window.review.openExample();
    if (!result.ok) throw new Error('Example unavailable');
    showReview(result.example, result.progress);
  } catch {
    errorMessage.textContent = 'Не удалось открыть учебный MR. Проверьте, что файл fixtures/example.json на месте и не повреждён, затем попробуйте снова.';
    errorMessage.hidden = false;
  } finally {
    setOpeningReview(false);
    if (!welcome.hidden) openButton.focus();
  }
});

openLocalButton.addEventListener('click', async () => {
  setOpeningReview(true);
  errorMessage.hidden = true;
  const messages = {
    'git-missing': 'Git недоступен. Установите Git и откройте папку снова.',
    'not-repository': 'Выберите папку внутри рабочего дерева Git-репозитория.',
    empty: 'В рабочем дереве нет незакоммиченных изменений.',
    'too-large': 'Изменений слишком много для одного ревью.',
    'read-failed': 'Не удалось прочитать изменения Git. Проверьте доступ к папке и попробуйте снова.',
  };
  try {
    const result = await window.review.openLocal();
    if (welcome.hidden) return;
    if (result.ok) showReview(result.review, result.progress, { source: 'Git', incomplete: false });
    else if (result.error !== 'cancelled') {
      errorMessage.textContent = messages[result.error] ?? messages['read-failed'];
      errorMessage.hidden = false;
    }
  } catch {
    errorMessage.textContent = messages['read-failed'];
    errorMessage.hidden = false;
  } finally {
    setOpeningReview(false);
    if (!welcome.hidden) openLocalButton.focus();
  }
});

backButton.addEventListener('click', () => {
  reviewScreen.hidden = true;
  backButton.hidden = true;
  welcome.hidden = false;
  openLocalButton.focus();
});
