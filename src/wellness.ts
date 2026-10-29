/**
 * Hábitos, puntos y estado de ánimo.
 *
 * Todo se guarda como eventos append-only en la bóveda:
 *   habit.saved / habit.deleted / habit.logged / mood.logged
 *
 * Un hábito puede ser diario, semanal (días concretos o N veces por semana) o
 * mensual (día del mes). Los puntos solo se suman una vez por hábito y fecha:
 * el último evento de ese día manda.
 */
import type { Habit, HabitFrequency, HabitLog, MoodEntry, MoodScore, VaultEvent } from './types';
import { addDays, parseISO, startOfWeek, todayISO } from './metrics';

export interface HabitToday {
  habit: Habit;
  done: boolean;
  points: number;
  due: boolean;
}

export interface MoodSummary {
  date: string;
  mood: MoodScore | null;
  summary: string;
  note: string;
}

export interface WellnessDigest {
  habits: Habit[];
  today: HabitToday[];
  dueToday: number;
  doneToday: number;
  pointsToday: number;
  pointsWeek: number;
  pointsMonth: number;
  streak: number;
  bestStreak: number;
  moodToday: MoodEntry | null;
  moodAverage7: number | null;
  moodTrend: number | null;
  summaries: MoodSummary[];
  week: Array<{ date: string; label: string; points: number; due: number; done: number; mood: MoodScore | null }>;
}

const DAY_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function reduceHabits(events: VaultEvent[]): Habit[] {
  const map = new Map<string, Habit>();
  for (const event of events) {
    if (event.kind === 'habit.saved') {
      const raw = event.payload as Partial<Habit> | null;
      if (!raw?.id || !raw.name) continue;
      map.set(raw.id, {
        id: raw.id,
        name: String(raw.name).trim(),
        note: raw.note ? String(raw.note) : '',
        frequency: normalizeFrequency(raw.frequency),
        days: Array.isArray(raw.days) ? raw.days.filter((d) => d >= 0 && d <= 6) : [],
        timesPerWeek: clampInt(raw.timesPerWeek, 1, 7, 1),
        dayOfMonth: clampInt(raw.dayOfMonth, 1, 31, 1),
        points: clampInt(raw.points, 1, 100, 10),
        enabled: raw.enabled !== false,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : event.timestamp,
      });
    } else if (event.kind === 'habit.deleted') {
      const id = (event.payload as { id?: string } | null)?.id;
      if (id) map.delete(id);
    }
  }
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeFrequency(value: unknown): HabitFrequency {
  return value === 'weekly' || value === 'monthly' ? value : 'daily';
}

export function reduceHabitLogs(events: VaultEvent[]): Map<string, HabitLog> {
  const map = new Map<string, HabitLog>();
  for (const event of events) {
    if (event.kind !== 'habit.logged') continue;
    const raw = event.payload as Partial<HabitLog> | null;
    if (!raw?.habitId || !raw.date) continue;
    map.set(`${raw.habitId}:${raw.date}`, {
      habitId: raw.habitId,
      date: raw.date,
      completed: raw.completed !== false,
      points: Math.max(0, Number(raw.points) || 0),
    });
  }
  return map;
}

export function reduceMoods(events: VaultEvent[]): MoodEntry[] {
  const map = new Map<string, MoodEntry>();
  for (const event of events) {
    if (event.kind !== 'mood.logged') continue;
    const raw = event.payload as Partial<MoodEntry> | null;
    if (!raw?.date) continue;
    const mood = Number(raw.mood);
    map.set(raw.date, {
      date: raw.date,
      mood: (mood >= 1 && mood <= 5 ? Math.round(mood) : 3) as MoodScore,
      note: typeof raw.note === 'string' ? raw.note : '',
      summary: sanitizeSummary(typeof raw.summary === 'string' ? raw.summary : ''),
    });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** El resumen diario nunca supera cinco palabras. */
export function sanitizeSummary(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');
}

export function summaryWordCount(input: string): number {
  return input.trim() ? input.trim().split(/\s+/).length : 0;
}

export function isHabitDue(habit: Habit, date: string): boolean {
  if (!habit.enabled) return false;
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'monthly') {
    return parseISO(date).getDate() === habit.dayOfMonth;
  }
  if (habit.days.length > 0) {
    return habit.days.includes(parseISO(date).getDay());
  }
  // Sin días concretos: está disponible cualquier día hasta completar la cuota.
  return true;
}

/** Etiqueta legible de la programación. */
export function habitScheduleLabel(habit: Habit): string {
  if (habit.frequency === 'daily') return 'Cada día';
  if (habit.frequency === 'monthly') return `Día ${habit.dayOfMonth} de cada mes`;
  if (habit.days.length > 0) {
    return habit.days.length === 7
      ? 'Cada día'
      : habit.days
          .slice()
          .sort()
          .map((d) => DAY_LABELS[d])
          .join(' · ');
  }
  return `${habit.timesPerWeek}× por semana`;
}

/** Veces que toca esta semana (para hábitos sin días concretos). */
export function weeklyTarget(habit: Habit): number {
  if (habit.frequency === 'daily') return 7;
  if (habit.frequency === 'monthly') return 1;
  if (habit.days.length > 0) return habit.days.length;
  return habit.timesPerWeek;
}

export function habitDone(habit: Habit, logs: Map<string, HabitLog>, date = todayISO()): boolean {
  const log = logs.get(`${habit.id}:${date}`);
  return Boolean(log?.completed);
}

export function wellnessDigest(events: VaultEvent[], now = new Date()): WellnessDigest {
  const habits = reduceHabits(events);
  const logs = reduceHabitLogs(events);
  const moods = reduceMoods(events);
  const today = todayISO(now);
  const weekStart = todayISO(startOfWeek(now));
  const monthPrefix = today.slice(0, 7);

  const todayList = habits.map((habit) => {
    const due = isHabitDue(habit, today);
    const done = habitDone(habit, logs, today);
    return { habit, due, done, points: done ? logs.get(`${habit.id}:${today}`)?.points ?? habit.points : 0 };
  });
  const dueToday = todayList.filter((item) => item.due).length;
  const doneToday = todayList.filter((item) => item.due && item.done).length;
  const pointsToday = todayList.reduce((sum, item) => sum + item.points, 0);

  const pointsIn = (predicate: (log: HabitLog) => boolean) =>
    [...logs.values()].filter((log) => log.completed && predicate(log)).reduce((sum, log) => sum + log.points, 0);

  const pointsWeek = pointsIn((log) => log.date >= weekStart && log.date <= today);
  const pointsMonth = pointsIn((log) => log.date.startsWith(monthPrefix));

  const { streak, bestStreak } = habitStreaks(habits, logs, now);

  const moodByDate = new Map(moods.map((entry) => [entry.date, entry]));
  const last7 = Array.from({ length: 7 }, (_, index) => {
    const date = todayISO(addDays(now, index - 6));
    return moodByDate.get(date)?.mood ?? null;
  }).filter((mood): mood is MoodScore => mood !== null);
  const moodAverage7 = last7.length ? last7.reduce((a, b) => a + b, 0) / last7.length : null;

  const previous7 = Array.from({ length: 7 }, (_, index) => {
    const date = todayISO(addDays(now, index - 13));
    return moodByDate.get(date)?.mood ?? null;
  }).filter((mood): mood is MoodScore => mood !== null);
  const previousAvg = previous7.length ? previous7.reduce((a, b) => a + b, 0) / previous7.length : null;

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = todayISO(addDays(parseISO(weekStart), index));
    const due = habits.filter((habit) => isHabitDue(habit, date)).length;
    const done = habits.filter((habit) => habitDone(habit, logs, date)).length;
    return {
      date,
      label: DAY_LABELS[parseISO(date).getDay()],
      points: [...logs.values()]
        .filter((log) => log.date === date && log.completed)
        .reduce((sum, log) => sum + log.points, 0),
      due,
      done,
      mood: moodByDate.get(date)?.mood ?? null,
    };
  });

  return {
    habits,
    today: todayList,
    dueToday,
    doneToday,
    pointsToday,
    pointsWeek,
    pointsMonth,
    streak,
    bestStreak,
    moodToday: moodByDate.get(today) ?? null,
    moodAverage7,
    moodTrend: moodAverage7 !== null && previousAvg !== null ? moodAverage7 - previousAvg : null,
    summaries: moods.slice(-14).reverse().map((entry) => ({
      date: entry.date,
      mood: entry.mood,
      summary: entry.summary,
      note: entry.note,
    })),
    week,
  };
}

/**
 * Racha de días en los que se completó todo lo que tocaba. Los días sin
 * hábitos programados no rompen la racha.
 */
export function habitStreaks(
  habits: Habit[],
  logs: Map<string, HabitLog>,
  now = new Date(),
): { streak: number; bestStreak: number } {
  if (!habits.length) return { streak: 0, bestStreak: 0 };
  const start = addDays(now, -366);
  const days: Array<{ date: string; complete: boolean; scheduled: boolean }> = [];
  for (let index = 0; index <= 366; index += 1) {
    const date = todayISO(addDays(start, index));
    const scheduled = habits.filter((habit) => isHabitDue(habit, date));
    const complete = scheduled.length > 0 && scheduled.every((habit) => habitDone(habit, logs, date));
    days.push({ date, complete, scheduled: scheduled.length > 0 });
  }

  let best = 0;
  let current = 0;
  for (const day of days) {
    if (day.complete) {
      current += 1;
      best = Math.max(best, current);
    } else if (day.scheduled) {
      current = 0;
    }
  }

  let streak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index];
    if (!day.scheduled) continue;
    if (!day.complete) {
      // El día de hoy todavía puede completarse: no rompe la racha.
      if (day.date === todayISO(now) && streak === 0) continue;
      break;
    }
    streak += 1;
  }
  return { streak, bestStreak: best };
}

/** Resumen automático de cinco palabras como máximo. */
export function autoSummary(done: number, due: number, mood: MoodScore | null): string {
  const moodWord =
    mood === null ? 'sin ánimo' : mood >= 4 ? 'buen ánimo' : mood === 3 ? 'ánimo neutro' : 'ánimo bajo';
  if (due === 0) return `Día libre, ${moodWord}`;
  if (done >= due) return `Día completo, ${moodWord}`;
  if (done === 0) return `Pendientes, ${moodWord}`;
  return `${done} de ${due}, ${moodWord}`;
}

export const MOOD_FACES: Array<{ value: MoodScore; label: string; face: string }> = [
  { value: 1, label: 'Muy bajo', face: '😞' },
  { value: 2, label: 'Bajo', face: '🙁' },
  { value: 3, label: 'Neutro', face: '😐' },
  { value: 4, label: 'Bien', face: '🙂' },
  { value: 5, label: 'Muy bien', face: '😄' },
];

export function defaultHabits(createdAt = new Date().toISOString()): Habit[] {
  return [
    {
      id: 'habit-walk',
      name: 'Caminar 20 minutos',
      note: 'Movimiento diario de baja intensidad.',
      frequency: 'daily',
      days: [],
      timesPerWeek: 7,
      dayOfMonth: 1,
      points: 10,
      enabled: true,
      createdAt,
    },
    {
      id: 'habit-protein',
      name: 'Llegar a la proteína objetivo',
      note: 'Reparte la proteína entre las comidas principales.',
      frequency: 'daily',
      days: [],
      timesPerWeek: 7,
      dayOfMonth: 1,
      points: 10,
      enabled: true,
      createdAt,
    },
    {
      id: 'habit-strength',
      name: 'Entrenamiento de fuerza',
      note: 'Tres sesiones semanales son suficientes para preservar músculo.',
      frequency: 'weekly',
      days: [1, 3, 5],
      timesPerWeek: 3,
      dayOfMonth: 1,
      points: 20,
      enabled: true,
      createdAt,
    },
    {
      id: 'habit-review',
      name: 'Revisar el mes',
      note: 'Ajusta objetivos según la tendencia, no según un día aislado.',
      frequency: 'monthly',
      days: [],
      timesPerWeek: 1,
      dayOfMonth: 1,
      points: 25,
      enabled: true,
      createdAt,
    },
  ];
}
