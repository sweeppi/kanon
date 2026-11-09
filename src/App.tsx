import { useEffect, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { StoreProvider, useStore } from './lib/store';
import { ToastProvider } from './components/ui';
import { requestPersistence } from './lib/data/db';
import { isIOS, isStandalone } from './lib/platform';
import { Home } from './pages/Home';
import { Measurements } from './pages/Measurements';
import { Strength } from './pages/Strength';
import { Nutrition } from './pages/Nutrition';
import { AdvicePage } from './pages/Advice';
import { SettingsPage } from './pages/Settings';

export type Route = 'home' | 'measure' | 'strength' | 'food' | 'advice' | 'settings';
const ROUTES: Route[] = ['home', 'measure', 'strength', 'food', 'advice', 'settings'];

const readRoute = (): Route => {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ROUTES.includes(h) ? h : 'home';
};


function Icon({ name }: { name: Route }) {
  const p: Record<Route, ReactNode> = {
    home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
    measure: <path d="M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4" />,
    strength: <path d="M2 12h3M19 12h3M5 8v8M19 8v8M8 6v12M16 6v12M8 12h8" />,
    food: <path d="M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-2 2-2 6 0 8v10" />,
    advice: <path d="M12 3a6 6 0 0 0-3 11v3h6v-3a6 6 0 0 0-3-11zM9 21h6" />,
    settings: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p[name]}
    </svg>
  );
}

const LABELS: Record<Route, string> = { home: 'Главная', measure: 'Замеры', strength: 'Силовые', food: 'Питание', advice: 'Советы', settings: 'Настройки' };

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="5" y="4" width="22" height="3" rx="1" fill="currentColor" />
      <rect x="7" y="25" width="18" height="3" rx="1" fill="currentColor" />
      <rect x="9" y="8" width="3" height="16" fill="currentColor" />
      <rect x="14.5" y="8" width="3" height="16" fill="currentColor" />
      <rect x="20" y="8" width="3" height="16" fill="currentColor" />
    </svg>
  );
}

function Shell() {
  const [route, setRoute] = useState<Route>(readRoute);
  const { settings, ready, d } = useStore();
  const [installHidden, setInstallHidden] = useState(() => {
    try {
      return localStorage.getItem('kanon.installHidden') === '1';
    } catch {
      return false;
    }
  });
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    const on = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    void requestPersistence();
  }, []);

  useEffect(() => {
    const apply = () => {
      const t = settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : settings.theme;
      document.documentElement.dataset.theme = t;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f4f1ec' : '#121212');
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  const showInstall = !isStandalone() && !installHidden;
  const backupDays = d.adviceCtx.daysSinceBackup;
  const showBackup = backupDays !== undefined && (backupDays === null || backupDays > 7);

  return (
    <>
      <header className="topbar">
        <a href="#home" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}>
          <Logo />
          КАНОН
        </a>
        {d.streak > 0 && (
          <span className="badge badge-accent" title="Дней подряд с любой записью">
            Серия: {d.streak} дн.
          </span>
        )}
      </header>

      {needRefresh && (
        <div className="banner banner-warn spread">
          <span>Доступна новая версия приложения.</span>
          <button className="btn btn-small btn-primary" onClick={() => updateServiceWorker(true)}>
            Обновить
          </button>
        </div>
      )}
      {showInstall && (
        <div className="banner">
          <b>Установите приложение на экран «Домой».</b>{' '}
          {isIOS()
            ? 'В Safari: кнопка «Поделиться» → «На экран „Домой“». Без установки iOS может удалить данные сайта, если вы долго им не пользуетесь.'
            : 'В меню браузера выберите «Установить приложение». Так данные хранятся надёжнее и всё работает офлайн.'}
          <div className="row" style={{ marginTop: 6 }}>
            <button
              className="btn btn-small"
              onClick={() => {
                setInstallHidden(true);
                try {
                  localStorage.setItem('kanon.installHidden', '1');
                } catch {
                  /* приватный режим */
                }
              }}
            >
              Понятно
            </button>
          </div>
        </div>
      )}
      {showBackup && route !== 'settings' && (
        <div className="banner banner-warn spread">
          <span>{backupDays === null ? 'Бэкапа ещё не было.' : `Последний бэкап ${Math.floor(backupDays)} дн. назад.`} Сохраните файл — это единственная копия данных.</span>
          <a className="btn btn-small" href="#settings">
            Бэкап
          </a>
        </div>
      )}

      <main>
        {!ready ? (
          <div className="empty">Загрузка…</div>
        ) : route === 'home' ? (
          <Home />
        ) : route === 'measure' ? (
          <Measurements />
        ) : route === 'strength' ? (
          <Strength />
        ) : route === 'food' ? (
          <Nutrition />
        ) : route === 'advice' ? (
          <AdvicePage />
        ) : (
          <SettingsPage />
        )}
      </main>

      <footer className="tabbar">
        <nav aria-label="Разделы">
          {ROUTES.map((r) => (
            <a key={r} href={`#${r}`} aria-current={route === r ? 'page' : undefined}>
              <Icon name={r} />
              {LABELS[r]}
            </a>
          ))}
        </nav>
      </footer>
    </>
  );
}

export function App() {
  return (
    <ToastProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </ToastProvider>
  );
}
