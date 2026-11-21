type ScreenReview = import('../../review/domain/review').Review;
type ScreenFile = import('../../review/domain/review').ChangedFile;

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

function showReview(example: ScreenReview, incomplete = false, source = 'Сервис') {
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

  const entries = example.files.map((file) => {
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
    button.addEventListener('click', () => showDiff(file, button, source));
    entry.append(button);
    return { entry, button };
  });

  fileList.replaceChildren(...entries.map(({ entry }) => entry));
  welcome.hidden = true;
  reviewScreen.hidden = false;
  fileList.scrollTo(0, 0);
  backButton.hidden = false;
  showDiff(example.files[0], entries[0].button, source);
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
