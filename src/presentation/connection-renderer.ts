interface Window {
  readonly github: import('./github/github-ipc').GitHubBridge;
  readonly gitlab: import('./gitlab/gitlab-ipc').GitLabBridge;
}

(() => {
  type Provider = 'github' | 'gitlab';
  type Result = import('../connections/application/account-connection').ConnectionResult;
  type ErrorCode = import('../connections/application/account-connection').ConnectionError;
  type LinkedReviewError = import('../review/application/linked-review').LinkedReviewError;

  const services = {
    github: {
      name: 'GitHub',
      address: 'https://github.com',
      permission: 'Pull requests: Read-only',
      reviewName: 'PR',
      openReview: (link: string) => window.github.openPullRequest(link),
      link: 'https://github.com/owner/repo/pull/123',
    },
    gitlab: {
      name: 'GitLab',
      address: 'https://gitlab.example.com',
      permission: 'read_api или User: Read и Merge Request: Read',
      reviewName: 'MR',
      openReview: (link: string) => window.gitlab.openMergeRequest(link),
      link: 'https://gitlab.example.com/group/project/-/merge_requests/123',
    },
  };

  const dialog = document.querySelector<HTMLDialogElement>('#account-dialog')!;
  const form = document.querySelector<HTMLFormElement>('#account-form')!;
  const address = document.querySelector<HTMLInputElement>('#account-address')!;
  const token = document.querySelector<HTMLInputElement>('#account-token')!;
  const status = byId('account-status');
  const error = byId('account-error');
  const connect = document.querySelector<HTMLButtonElement>('#account-connect')!;
  const disconnect = document.querySelector<HTMLButtonElement>('#account-disconnect')!;
  const session = document.querySelector<HTMLButtonElement>('#account-session')!;
  const reviewForm = document.querySelector<HTMLFormElement>('#account-review-form')!;
  const reviewLink = document.querySelector<HTMLInputElement>('#account-review-link')!;
  const open = document.querySelector<HTMLButtonElement>('#account-review-open')!;
  const reviewHelp = byId('account-review-help');
  const reviewError = byId('account-review-error');

  interface View {
    provider: Provider;
    connected: boolean;
    busy: boolean;
  }

  let active: View | undefined;
  const drafts: Record<Provider, string> = { github: '', gitlab: '' };

  function renderControls(view: View): void {
    const service = services[view.provider];
    for (const control of [connect, disconnect, session, token, address]) control.disabled = view.busy;
    reviewLink.disabled = view.busy;
    open.disabled = !view.connected || view.busy;
    connect.textContent = view.connected ? 'Обновить подключение' : 'Подключить';
    disconnect.hidden = !view.connected;
    reviewHelp.hidden = view.connected;
    if (reviewHelp.hidden) reviewLink.removeAttribute('aria-describedby');
    else reviewLink.setAttribute('aria-describedby', reviewHelp.id);
    reviewHelp.textContent = `Подключите ${service.name}, чтобы открыть ${service.reviewName}.`;
  }

  async function run(view: View, action: () => Promise<Result>, clearAddress = false): Promise<void> {
    if (view.busy) return;
    view.busy = true;
    renderControls(view);
    error.hidden = true;

    const { name, permission } = services[view.provider];
    const messages: Record<ErrorCode, string> = {
      'invalid-address': 'Введите HTTPS-адрес сервиса без логина, пароля и параметров.',
      'invalid-token': 'Проверьте токен и введите его снова.',
      unauthorized: `${name} отклонил токен. Проверьте его срок действия и введите заново.`,
      forbidden: `${name} запретил доступ. Проверьте право ${permission} и доступ аккаунта.`,
      'profile-read-denied': 'GitLab запретил чтение профиля (/api/v4/user) и не указал причину. Если у токена есть User → Read, уточните у администратора GitLab, почему этот запрос возвращает 403.',
      'profile-scope-missing': 'GitLab сообщил, что токену не хватает прав для чтения профиля. Для fine-grained токена проверьте User → User → Read. Право Merge Request → Read действует на MR.',
      'profile-html-denial': 'При чтении профиля сервер вернул HTML и статус 403. Проверьте адрес GitLab. Если адрес верный, уточните у администратора правила доступа к API.',
      redirect: `${name} вернул перенаправление. Проверьте HTTPS-адрес.`,
      'invalid-server': `Сервер не вернул данные аккаунта ${name}.`,
      unreachable: `${name} недоступен. Проверьте подключение к сети.`,
      storage: 'Связка ключей недоступна. Разблокируйте её и попробуйте снова.',
    };

    try {
      const result = await action();
      if (active !== view || !dialog.open) return;
      if (!result.ok) {
        session.hidden = !result.canUseSession;
        error.textContent = result.canUseSession
          ? `${name} подтвердил токен. Связка ключей недоступна. Можно сохранить подключение только до выхода.`
          : (messages[result.error] ?? 'Не удалось выполнить действие. Попробуйте снова.');
        error.hidden = false;
        return;
      }
      session.hidden = true;
      view.connected = result.status.connected;
      if (result.status.connected) {
        address.value = result.status.address;
        const mode = result.status.storage === 'session' ? 'до выхода' : 'сохранено в Связке ключей';
        status.textContent = `Подключено: ${result.status.username} · ${mode}`;
      } else {
        if (clearAddress && view.provider === 'gitlab') address.value = '';
        status.textContent = `${name} не подключён.`;
      }
    } catch {
      if (active === view && dialog.open) {
        error.textContent = 'Не удалось выполнить действие. Попробуйте снова.';
        error.hidden = false;
      }
    } finally {
      view.busy = false;
      if (active === view && dialog.open) renderControls(view);
    }
  }

  function openDialog(provider: Provider): void {
    const view: View = { provider, connected: false, busy: false };
    const service = services[provider];
    active = view;
    byId('account-title').textContent = `Подключение ${service.name}`;
    byId('account-permission').textContent = service.permission;
    status.textContent = 'Проверяем подключение…';
    address.readOnly = provider === 'github';
    address.value = provider === 'github' ? service.address : '';
    address.placeholder = service.address;
    reviewLink.value = drafts[provider];
    reviewLink.placeholder = service.link;
    open.textContent = 'Открыть';
    error.hidden = true;
    reviewError.hidden = true;
    session.hidden = true;
    dialog.showModal();
    void run(view, () => window[provider].status());
  }

  for (const provider of ['github', 'gitlab'] as const) {
    byId(`${provider}-settings`).addEventListener('click', () => openDialog(provider));
  }
  byId('account-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    const view = active;
    active = undefined;
    token.value = '';
    token.setCustomValidity('');
    if (view) drafts[view.provider] = reviewLink.value;
    if (view) void window[view.provider].discardPending().catch(() => {});
  });
  token.addEventListener('invalid', () => {
    if (token.validity.valueMissing) token.setCustomValidity('Введите токен на чтение.');
  });
  token.addEventListener('input', () => token.setCustomValidity(''));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const view = active;
    if (!view || view.busy) return;
    const secret = token.value;
    token.value = '';
    void run(view, () => view.provider === 'github'
      ? window.github.connect(secret)
      : window.gitlab.connect(address.value, secret));
  });
  disconnect.addEventListener('click', () => {
    const view = active;
    if (view) void run(view, () => window[view.provider].disconnect(), true);
  });
  session.addEventListener('click', () => {
    const view = active;
    if (view) void run(view, () => window[view.provider].useSession());
  });

  function reviewMessage(view: View, code: LinkedReviewError): string {
    const { name, reviewName } = services[view.provider];
    const messages: Record<LinkedReviewError, string> = {
      'invalid-link': `Введите HTTPS-ссылку на ${reviewName} в ${name}.`,
      'different-server': 'Ссылка ведёт на другой сервер GitLab. Откройте подключение к этому серверу.',
      'not-connected': `Подключите аккаунт ${name}.`,
      storage: 'Связка ключей недоступна. Разблокируйте её или подключитесь до выхода.',
      unauthorized: `${name} отклонил токен. Обновите подключение.`,
      forbidden: view.provider === 'gitlab'
        ? 'GitLab запретил доступ к MR и не указал причину. Проверьте, что проект из ссылки входит в область доступа токена.'
        : 'GitHub запретил доступ или ограничил запросы. Проверьте права токена и попробуйте снова.',
      'review-scope-missing': 'GitLab сообщил о нехватке прав токена для этого запроса. Проверьте доступ к проекту из ссылки и право Merge Request → Read.',
      'review-project-read-missing': 'GitLab явно запросил право Project → Read. Проверьте права токена для проекта из ссылки.',
      'review-html-denial': 'При загрузке MR сервер вернул HTML и статус 403. Проверьте правила доступа к API на сервере GitLab или прокси.',
      'rate-limited': 'GitLab ограничил частоту запросов. Повторите попытку позже.',
      'not-found': `${reviewName} не найден или токену недоступен репозиторий.`,
      redirect: `${name} перенаправил запрос. Проверьте ссылку на ${reviewName}.`,
      'invalid-server': `${name} не вернул данные ${reviewName} в ожидаемом формате.`,
      unreachable: `Не удалось получить ${reviewName}. Проверьте подключение к ${name}.`,
      empty: `${name} не вернул изменённых файлов для этого ${reviewName}.`,
      'diff-unavailable': `${name} не вернул доступный diff для этого ${reviewName}.`,
    };
    return messages[code] ?? messages['invalid-server'];
  }

  reviewForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const view = active;
    if (!view || open.disabled) return;
    view.busy = true;
    renderControls(view);
    open.textContent = 'Открываем…';
    reviewError.hidden = true;
    const service = services[view.provider];
    try {
      const result = await service.openReview(reviewLink.value);
      if (active !== view || !dialog.open) return;
      if (result.ok) {
        dialog.close();
        showReview(result.review, result.incomplete, service.name, result.languageSorting);
      } else {
        reviewError.textContent = reviewMessage(view, result.error);
        reviewError.hidden = false;
      }
    } catch {
      if (active === view && dialog.open) {
        reviewError.textContent = reviewMessage(view, 'unreachable');
        reviewError.hidden = false;
      }
    } finally {
      view.busy = false;
      if (active === view && dialog.open) {
        open.textContent = 'Открыть';
        renderControls(view);
      }
    }
  });
})();
