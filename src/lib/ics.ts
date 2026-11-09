// Напоминания без сервера: файл календаря .ics с повторяющимися событиями.
// iPhone: открыть файл → «Добавить все» в Календарь. Пуш-уведомления PWA на iOS требуют сервер — здесь не нужны.

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export interface Reminder {
  uid: string;
  title: string;
  description: string;
  /** локальная дата начала YYYY-MM-DD */
  start: string;
  time: string; // HH:MM
  rrule: string; // например FREQ=DAILY или FREQ=WEEKLY;INTERVAL=1
}

export function buildIcs(reminders: Reminder[], now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kanon//Body Tracker//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const r of reminders) {
    const [h, m] = r.time.split(':');
    const dt = `${r.start.replace(/-/g, '')}T${h}${m}00`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.uid}@kanon.local`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${dt}`,
      'DURATION:PT10M',
      `RRULE:${r.rrule}`,
      `SUMMARY:${esc(r.title)}`,
      `DESCRIPTION:${esc(r.description)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(r.title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function defaultReminders(start: string, everyDays: number): Reminder[] {
  return [
    {
      uid: 'kanon-weigh-in',
      title: 'Канон: взвешивание',
      description: 'Утром, натощак, после туалета. Запишите вес в приложении.',
      start,
      time: '07:15',
      rrule: 'FREQ=DAILY',
    },
    {
      uid: 'kanon-measure',
      title: 'Канон: замеры и фото',
      description: 'Обхваты одной лентой, фото спереди/сбоку/сзади. Затем сделайте бэкап.',
      start,
      time: '07:30',
      rrule: everyDays % 7 === 0 ? `FREQ=WEEKLY;INTERVAL=${everyDays / 7}` : `FREQ=DAILY;INTERVAL=${everyDays}`,
    },
  ];
}
