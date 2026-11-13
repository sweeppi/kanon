// «Ещё»: разделы, которым не хватило места в нижней навигации (правило — не больше пяти вкладок).
import { Icon, type IconName } from '../components/icons';

const ROWS: Array<{ href: string; icon: IconName; title: string; text: string }> = [
  { href: '#stats', icon: 'stats', title: 'Статистика', text: 'Итоги за 7, 30 и 90 дней; сон и шаги из «Здоровья»' },
  { href: '#academy', icon: 'academy', title: 'Академия', text: 'Короткие статьи с источниками: объём, сушка, белок, сон' },
  { href: '#report', icon: 'report', title: 'Отчёт для тренера', text: 'Итоги за 30 или 90 дней на одной странице, в PDF' },
  { href: '#advice', icon: 'advice', title: 'Советы', text: 'Что качать и почему — со ссылками на исследования' },
  { href: '#settings', icon: 'settings', title: 'Настройки', text: 'Профиль, цели, ограничения по здоровью, бэкап' },
];

export function More() {
  return (
    <div>
      <header className="screen-head">
        <h1 className="display">Ещё</h1>
      </header>
      <nav className="card rows" aria-label="Другие разделы">
        {ROWS.map((r) => (
          <a key={r.href} className="rowlink" href={r.href}>
            <span className="rowlink-icon">
              <Icon name={r.icon} />
            </span>
            <span className="rowlink-text">
              <b>{r.title}</b>
              <small>{r.text}</small>
            </span>
            <Icon name="chevron" size={20} />
          </a>
        ))}
      </nav>
    </div>
  );
}
