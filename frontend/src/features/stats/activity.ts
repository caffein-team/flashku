const DAY = 24 * 60 * 60 * 1000;
export const WEEKS = 53;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Sesi per hari (hari yang lalu → jumlah). Kosong sampai backend punya endpoint statistik.
const SESSIONS: Record<number, number> = {};

export type Cell = { date: Date; sessions: number; future: boolean };

export type ActivityStats = {
  /** Kolom = minggu (Senin–Minggu), baris = hari. */
  weeks: Cell[][];
  totalSessions: number;
  activeDays: number;
  streak: { days: number; label: string };
  rangeLabel: string;
  year: number;
  monthLabels: (string | null)[];
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Senin = 0 ... Minggu = 6. */
const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

function streakLabel(from: Date, to: Date): string {
  if (from.getMonth() === to.getMonth()) {
    return `${from.getDate()}–${to.getDate()} ${MONTH_LONG[to.getMonth()]} ${to.getFullYear()}`;
  }
  return `${from.getDate()} ${MONTH_SHORT[from.getMonth()]} – ${to.getDate()} ${MONTH_SHORT[to.getMonth()]} ${to.getFullYear()}`;
}

export function buildActivityStats(now = new Date()): ActivityStats {
  const today = startOfDay(now);
  const firstMonday = new Date(today.getTime() - (WEEKS - 1) * 7 * DAY - weekdayIndex(today) * DAY);

  const weeks: Cell[][] = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(firstMonday.getTime() + (w * 7 + d) * DAY);
      const daysAgo = Math.round((today.getTime() - date.getTime()) / DAY);
      return { date, sessions: SESSIONS[daysAgo] ?? 0, future: daysAgo < 0 };
    }),
  );

  const cells = weeks.flat();
  let streakDays = 0;
  while ((SESSIONS[streakDays] ?? 0) > 0) streakDays++;
  const streakStart = new Date(today.getTime() - Math.max(streakDays - 1, 0) * DAY);

  const monthLabels = weeks.map((week, i) => {
    const month = week[0].date.getMonth();
    return i === 0 || weeks[i - 1][0].date.getMonth() !== month ? MONTH_SHORT[month] : null;
  });

  return {
    weeks,
    totalSessions: cells.reduce((n, c) => n + c.sessions, 0),
    activeDays: cells.filter((c) => c.sessions > 0).length,
    streak: { days: streakDays, label: streakDays ? streakLabel(streakStart, today) : '—' },
    rangeLabel: `${firstMonday.getDate()} ${MONTH_SHORT[firstMonday.getMonth()]}${firstMonday.getFullYear() === today.getFullYear() ? '' : ` ${firstMonday.getFullYear()}`} – ${today.getDate()} ${MONTH_SHORT[today.getMonth()]} ${today.getFullYear()} · ${WEEKS} minggu`,
    year: today.getFullYear(),
    monthLabels,
  };
}
