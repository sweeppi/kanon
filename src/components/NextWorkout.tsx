// Карточка «что с тренировкой сейчас»: продолжить идущую, начать следующий день программы или собрать программу.
import { useStore } from '../lib/store';
import { Card } from './ui';
import { Icon } from './icons';
import { beginWorkout } from '../lib/program/actions';
import { dayMinutes } from '../lib/program/generate';
import { doneCount } from '../lib/program/session';

export function NextWorkout({ compact }: { compact?: boolean }) {
  const { active, programs, settings, sets } = useStore();
  const program = programs.find((p) => p.id === settings.activeProgramId);
  const day = program?.days[program.nextDay];
  const go = async (free?: boolean) => {
    await beginWorkout(sets, free ? undefined : program, free ? undefined : program?.nextDay);
    location.hash = 'workout';
  };

  if (active) {
    return (
      <a className="card" href="#workout">
        <div className="card-head">
          <h2>Идёт тренировка</h2>
          <span className="card-link" style={{ color: 'var(--accent)' }}>
            Продолжить
            <Icon name="chevron" size={16} />
          </span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {active.title}, подходов сделано: {doneCount(active)}
        </p>
      </a>
    );
  }

  // На экране «Сегодня» карточка появляется, только когда есть программа: без неё там и так много блоков
  if (compact && !day) return null;

  if (day && program) {
    return (
      <Card title="Следующая тренировка" extra={<span className="caption">≈ {dayMinutes(day)} мин</span>}>
        <p style={{ margin: '8px 0 0', fontWeight: 600 }}>{day.name}</p>
        <p className="muted tiny" style={{ margin: '4px 0 0' }}>
          {day.exercises
            .slice(0, 3)
            .map((e) => e.name)
            .join(', ')}
          {day.exercises.length > 3 ? ` и ещё ${day.exercises.length - 3}` : ''}
        </p>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={() => void go()}>
            Начать
          </button>
          {!compact && (
            <>
              <a className="btn" href="#program">
                Программа
              </a>
              <button className="btn" onClick={() => void go(true)}>
                Свободная
              </button>
            </>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card title="Программы пока нет">
      <p className="muted" style={{ margin: '8px 0 0' }}>
        Соберём программу под ваши дни, оборудование и ограничения по здоровью. Или начните свободную тренировку и добавляйте упражнения по ходу.
      </p>
      <div className="actions" style={{ marginTop: 12 }}>
        <a className="btn btn-primary" href="#program">
          Собрать программу
        </a>
        <button className="btn" onClick={() => void go(true)}>
          Свободная тренировка
        </button>
      </div>
    </Card>
  );
}
