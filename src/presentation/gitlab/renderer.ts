interface Window {
  readonly gitlab: import('./gitlab-ipc').GitLabBridge;
}

(() => {
  type Result = import('../../gitlab/application/gitlab-connection').ConnectionResult;
  type ErrorCode = import('../../gitlab/application/gitlab-connection').ConnectionError;

  const api = window.gitlab;
  const dialog = document.querySelector<HTMLDialogElement>('#gitlab-dialog')!;
  const form = document.querySelector<HTMLFormElement>('#gitlab-form')!;
  const address = document.querySelector<HTMLInputElement>('#gitlab-address')!;
  const token = document.querySelector<HTMLInputElement>('#gitlab-token')!;
  const status = document.querySelector<HTMLElement>('#gitlab-status')!;
  const error = document.querySelector<HTMLElement>('#gitlab-error')!;
  const connect = document.querySelector<HTMLButtonElement>('#gitlab-connect')!;
  const disconnect = document.querySelector<HTMLButtonElement>('#gitlab-disconnect')!;
  const session = document.querySelector<HTMLButtonElement>('#gitlab-session')!;

  const messages: Record<ErrorCode, string> = {
    'invalid-address': 'Введите адрес GitLab с HTTPS без логина, пароля и параметров.',
    'invalid-token': 'Проверьте токен и введите его снова.',
    unauthorized: 'GitLab отклонил токен. Проверьте его срок действия и введите заново.',
    forbidden: 'GitLab запретил доступ. Проверьте право read_api и доступ аккаунта.',
    redirect: 'Сервер перенаправил запрос. Укажите конечный HTTPS-адрес GitLab.',
    'invalid-server': 'Сервер не вернул данные аккаунта GitLab. Проверьте адрес.',
    unreachable: 'GitLab недоступен. Проверьте адрес, VPN и сертификат сервера.',
    storage: 'Связка ключей недоступна. Разблокируйте её и попробуйте снова.',
  };

  async function run(action: () => Promise<Result>, clearAddress = false): Promise<void> {
    for (const control of [connect, session, disconnect, address, token]) control.disabled = true;
    error.hidden = true;
    try {
      const result = await action();
      if (!result.ok) {
        session.hidden = !result.canUseSession;
        error.textContent = result.canUseSession
          ? 'GitLab подтвердил токен. Связка ключей недоступна. Можно сохранить подключение только до выхода.'
          : messages[result.error];
        error.hidden = false;
        return;
      }

      session.hidden = true;
      disconnect.hidden = !result.status.connected;
      connect.textContent = result.status.connected ? 'Обновить подключение' : 'Подключить';
      if (result.status.connected) {
        address.value = result.status.address;
        const mode = result.status.storage === 'session' ? 'до выхода' : 'сохранено в Связке ключей';
        status.textContent = `Подключено: ${result.status.username} · ${mode}`;
      } else {
        if (clearAddress) address.value = '';
        status.textContent = 'GitLab не подключён.';
      }
    } catch {
      error.textContent = 'Не удалось выполнить действие. Попробуйте снова.';
      error.hidden = false;
    } finally {
      for (const control of [connect, session, disconnect, address, token]) control.disabled = false;
    }
  }

  document.querySelector('#gitlab-settings')!.addEventListener('click', () => {
    dialog.showModal();
    void run(() => api.status());
  });
  document.querySelector('#gitlab-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    token.value = '';
    void api.discardPending().catch(() => {});
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = token.value;
    token.value = '';
    void run(() => api.connect(address.value, value));
  });
  disconnect.addEventListener('click', () => { void run(() => api.disconnect(), true); });
  session.addEventListener('click', () => { void run(() => api.useSession()); });
})();
