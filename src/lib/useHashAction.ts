// Ссылка-действие: «#food?add=1» открывает экран и сразу выполняет действие.
// Срабатывает и при открытии приложения по ссылке, и когда оно уже открыто на этом экране.
import { useEffect, useRef } from 'react';
import { clearHashParams, hashParams, hashRoute } from './links';

export function useHashAction(route: string, run: (p: URLSearchParams) => void, enabled = true): void {
  const ref = useRef(run);
  ref.current = run;
  useEffect(() => {
    if (!enabled) return;
    const go = () => {
      // чужие параметры не трогаем: при переходе на другой экран их должен получить он
      if (hashRoute() !== route) return;
      const p = hashParams();
      if (![...p.keys()].length) return;
      clearHashParams(); // действие одноразовое: перезагрузка страницы его не повторит
      ref.current(p);
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, [route, enabled]);
}
