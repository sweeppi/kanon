import { useEffect, useState } from 'react';
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
import { Onboarding } from './pages/Onboarding';
import { More } from './pages/More';
import { Workout } from './pages/Workout';
import { ProgramPage } from './pages/Program';
import { StatsPage } from './pages/Stats';
import { AcademyPage } from './pages/Academy';
import { ReportPage } from './pages/Report';
import { Logo } from './components/Logo';
import { Icon, type IconName } from './components/icons';

export type Route = 'home' | 'measure' | 'strength' | 'food' | 'advice' | 'settings' | 'more' | 'workout' | 'program' | 'stats' | 'academy' | 'report';
const ROUTES: Route[] = ['home', 'measure', 'strength', 'food', 'advice', 'settings', 'more', 'workout', 'program', 'stats', 'academy', 'report'];

const readRoute = (): Route => {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ROUTES.includes(h) ? h : 'home';
};

// Нижняя навигация: не больше пяти вкладок. «Советы» и «Настройки» живут внутри «Ещё».
const TABS: Array<{ route: Route; icon: IconName; label: string; also?: Route[] }> = [
  { route: 'home', icon: 'today', label: 'Сегодня' },
  { route: 'measure', icon: 'body', label: 'Тело' },
  { route: 'strength', icon: 'training', label: 'Тренировки', also: ['workout', 'program'] },
  { route: 'food', icon: 'food', label: 'Питание' },
  { route: 'more', icon: 'more', label: 'Ещё', also: ['advice', 'settings', 'stats', 'academy', 'report'] },
];


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
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f4f1ec' : '#000000');
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
      {/* Каждый экран рисует заголовок сам; общая шапка с названием нужна только мастеру первого запуска. */}
      {ready && !settings.onboarded && (
        <header className="topbar">
          <span className="brand">
            <Logo />
            Канон
          </span>
        </header>
      )}

      {needRefresh && (
        <div className="banner banner-warn spread no-print">
          <span>Доступна новая версия приложения.</span>
          <button className="btn btn-small btn-primary" onClick={() => updateServiceWorker(true)}>
            Обновить
          </button>
        </div>
      )}
      {showInstall && (
        <div className="banner no-print">
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
        <div className="banner banner-warn spread no-print">
          <span>{backupDays === null ? 'Бэкапа ещё не было.' : `Последний бэкап ${Math.floor(backupDays)} дн. назад.`} Сохраните файл — это единственная копия данных.</span>
          <a className="btn btn-small" href="#settings">
            Бэкап
          </a>
        </div>
      )}

      <main>
        {!ready ? (
          <div className="skeleton" role="status" aria-label="Загрузка" />
        ) : !settings.onboarded ? (
          <Onboarding />
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
        ) : route === 'more' ? (
          <More />
        ) : route === 'workout' ? (
          <Workout />
        ) : route === 'program' ? (
          <ProgramPage />
        ) : route === 'stats' ? (
          <StatsPage />
        ) : route === 'academy' ? (
          <AcademyPage />
        ) : route === 'report' ? (
          <ReportPage />
        ) : (
          <SettingsPage />
        )}
      </main>

      {settings.onboarded && (
      <footer className="tabbar">
        <nav aria-label="Разделы">
          {TABS.map((t) => (
            <a key={t.route} href={`#${t.route}`} aria-current={route === t.route || t.also?.includes(route) ? 'page' : undefined}>
              <Icon name={t.icon} />
              {t.label}
            </a>
          ))}
        </nav>
      </footer>
      )}
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
