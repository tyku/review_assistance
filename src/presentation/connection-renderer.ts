interface Window {
  readonly github: import('./github/github-ipc').GitHubBridge;
  readonly gitlab: import('./gitlab/gitlab-ipc').GitLabBridge;
}

function bindAccountDialog(provider: 'gitlab' | 'github'): void {
  type Result = import('../connections/application/account-connection').ConnectionResult;
  type ErrorCode = import('../connections/application/account-connection').ConnectionError;

  const api = window[provider];
  const name = provider === 'github' ? 'GitHub' : 'GitLab';
  const permission = provider === 'github' ? 'Pull requests: Read-only' : 'read_api';
  const dialog = document.querySelector<HTMLDialogElement>(`#${provider}-dialog`)!;
  const form = document.querySelector<HTMLFormElement>(`#${provider}-form`)!;
  const address = document.querySelector<HTMLInputElement>(`#${provider}-address`);
  const token = document.querySelector<HTMLInputElement>(`#${provider}-token`)!;
  const status = document.querySelector<HTMLElement>(`#${provider}-status`)!;
  const error = document.querySelector<HTMLElement>(`#${provider}-error`)!;
  const connect = document.querySelector<HTMLButtonElement>(`#${provider}-connect`)!;
  const disconnect = document.querySelector<HTMLButtonElement>(`#${provider}-disconnect`)!;
  const session = document.querySelector<HTMLButtonElement>(`#${provider}-session`)!;

  const messages: Record<ErrorCode, string> = {
    'invalid-address': 'Введите адрес GitLab с HTTPS без логина, пароля и параметров.',
    'invalid-token': 'Проверьте токен и введите его снова.',
    unauthorized: `${name} отклонил токен. Проверьте его срок действия и введите заново.`,
    forbidden: `${name} запретил доступ. Проверьте право ${permission} и доступ аккаунта.`,
    redirect: `${name} вернул перенаправление. Проверьте HTTPS-адрес.`,
    'invalid-server': `Сервер не вернул данные аккаунта ${name}.`,
    unreachable: `${name} недоступен. Проверьте подключение к сети.`,
    storage: 'Связка ключей недоступна. Разблокируйте её и попробуйте снова.',
  };

  const controls = [connect, session, disconnect, token, ...(address ? [address] : [])];

  async function run(action: () => Promise<Result>, clearAddress = false): Promise<void> {
    for (const control of controls) control.disabled = true;
    error.hidden = true;
    try {
      const result = await action();
      if (!result.ok) {
        session.hidden = !result.canUseSession;
        error.textContent = result.canUseSession
          ? `${name} подтвердил токен. Связка ключей недоступна. Можно сохранить подключение только до выхода.`
          : messages[result.error];
        error.hidden = false;
        return;
      }

      session.hidden = true;
      disconnect.hidden = !result.status.connected;
      connect.textContent = result.status.connected ? 'Обновить подключение' : 'Подключить';
      if (result.status.connected) {
        if (address) address.value = result.status.address;
        const mode = result.status.storage === 'session' ? 'до выхода' : 'сохранено в Связке ключей';
        status.textContent = `Подключено: ${result.status.username} · ${mode}`;
      } else {
        if (clearAddress && address) address.value = '';
        status.textContent = `${name} не подключён.`;
      }
    } catch {
      error.textContent = 'Не удалось выполнить действие. Попробуйте снова.';
      error.hidden = false;
    } finally {
      for (const control of controls) control.disabled = false;
    }
  }

  document.querySelector(`#${provider}-settings`)!.addEventListener('click', () => {
    dialog.showModal();
    void run(() => api.status());
  });
  document.querySelector(`#${provider}-close`)!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    token.value = '';
    void api.discardPending().catch(() => {});
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = token.value;
    token.value = '';
    void run(() => provider === 'github' ? window.github.connect(value) : window.gitlab.connect(address!.value, value));
  });
  disconnect.addEventListener('click', () => { void run(() => api.disconnect(), true); });
  session.addEventListener('click', () => { void run(() => api.useSession()); });
}

bindAccountDialog('gitlab');
bindAccountDialog('github');
