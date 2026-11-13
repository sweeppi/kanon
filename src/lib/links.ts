// Ссылки-действия: адреса, которые открывают нужный экран сразу с действием.
// Нужны для Быстрых команд iOS («Открыть URL»), закладок и ярлыков.

/** Параметры из адреса вида «#food?add=1». */
export function hashParams(hash: string = typeof location !== 'undefined' ? location.hash : ''): URLSearchParams {
  const i = hash.indexOf('?');
  return new URLSearchParams(i >= 0 ? hash.slice(i + 1) : '');
}

/** Убрать параметры действия из адреса, чтобы оно не повторилось при перезагрузке страницы. */
export function clearHashParams(): void {
  const base = location.hash.split('?')[0];
  if (base !== location.hash) history.replaceState(null, '', base);
}

/** Экран из адреса: «#food?add=1» → «food». */
export const hashRoute = (hash: string = typeof location !== 'undefined' ? location.hash : '') => hash.replace(/^#\/?/, '').split('?')[0];

export interface ActionLink {
  id: string;
  title: string;
  /** фраза для Siri — имя команды */
  phrase: string;
  url: string;
}

/** `appUrl` — адрес приложения без # (например, https://логин.github.io/kanon/). */
export function actionLinks(appUrl: string): ActionLink[] {
  const base = appUrl.split('#')[0];
  return [
    { id: 'food', title: 'Добавить еду', phrase: 'Записать еду', url: `${base}#food?add=1` },
    { id: 'workout', title: 'Начать следующую тренировку', phrase: 'Начать тренировку', url: `${base}#workout?start=1` },
    { id: 'measure', title: 'Внести замер', phrase: 'Записать вес', url: `${base}#measure` },
    { id: 'health', title: 'Сон и шаги', phrase: 'Записать сон', url: `${base}#stats?tab=health` },
    { id: 'today', title: 'Экран «Сегодня»', phrase: 'Открыть Канон', url: `${base}#home` },
  ];
}
