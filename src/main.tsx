import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Forum (SIL OFL 1.1) — заголовки экранов; лежит в сборке, без запросов к внешним серверам
import '@fontsource/forum/cyrillic-400.css';
import '@fontsource/forum/latin-400.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
