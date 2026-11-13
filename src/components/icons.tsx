// Единый набор иконок: сетка 24, линия 1,75, скруглённые концы, без заливки (см. design-system/kanon/MASTER.md).
// Иконка рядом с текстом — декоративная (aria-hidden). Кнопке-иконке подпись даёт aria-label на самой кнопке.
import type { ReactNode } from 'react';

export type IconName =
  | 'today'
  | 'body'
  | 'training'
  | 'food'
  | 'more'
  | 'chevron'
  | 'flame'
  | 'reset'
  | 'advice'
  | 'settings'
  | 'plus'
  | 'close'
  | 'edit'
  | 'trash'
  | 'help'
  | 'warning'
  | 'back'
  | 'check'
  | 'stats'
  | 'academy'
  | 'report';

const PATHS: Record<IconName, ReactNode> = {
  // колонна — знак Канона
  today: <path d="M5 5h14M6 19h12M8.5 5v14M12 5v14M15.5 5v14" />,
  body: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M6 9.5c2-1 4-1.5 6-1.5s4 .5 6 1.5M9.5 8.5l.5 6-1 6.5M14.5 8.5l-.5 6 1 6.5M10 14.5h4" />
    </>
  ),
  training: <path d="M3 12h2M19 12h2M5.5 8.5v7M18.5 8.5v7M8.5 6.5v11M15.5 6.5v11M8.5 12h7" />,
  food: <path d="M7 3v7a2.5 2.5 0 0 0 2.5 2.5V21M7 3v5M9.5 3v5M12 3v5a2.5 2.5 0 0 1-2.5 2.5M17 21v-7M17 14c-2-1.5-2.5-7 0-11v11" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.25" />
      <circle cx="12" cy="12" r="1.25" />
      <circle cx="18.5" cy="12" r="1.25" />
    </>
  ),
  chevron: <path d="M9 5.5l6.5 6.5L9 18.5" />,
  flame: <path d="M12 21c-3.6 0-6-2.5-6-5.8 0-2.6 1.6-4.3 3-6 1-1.3 1.8-2.6 1.8-5.2 2.6 1.4 4.2 3.6 4.6 6.2.7-.5 1.2-1.3 1.4-2.2 1.4 1.7 2.2 3.6 2.2 6.2 0 4-3 6.8-7 6.8z" />,
  reset: <path d="M4 5v5h5M4.6 10A8 8 0 1 1 5 15.5" />,
  advice: <path d="M9.5 18h5M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />,
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.500 6.500l4 4" />,
  trash: <path d="M4 7h16M9.500 7V4.500h5V7M6.500 7l1 12.500h9l1-12.500M10 11v5M14 11v5" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.500 9.500a2.500 2.500 0 1 1 3.600 2.200c-.700.400-1.100.900-1.100 1.800M12 17h.01" />
    </>
  ),
  warning: <path d="M12 4l9 15.500H3L12 4zM12 10v4.500M12 17h.01" />,
  back: <path d="M15 5.500L8.500 12l6.500 6.500" />,
  check: <path d="M5 12.500l4.500 4.500L19 7.500" />,
  stats: <path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" />,
  academy: <path d="M4 5.5c2.500-1 5.500-1 8 .5 2.500-1.500 5.500-1.500 8-.5v13c-2.500-1-5.500-1-8 .5-2.500-1.500-5.500-1.500-8-.5v-13zM12 6v13" />,
  report: <path d="M7 3.500h7l4 4V20.500H7V3.500zM14 3.500v4h4M10 12h5M10 15.500h5" />,
};

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
