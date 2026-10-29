import { describe, expect, it } from 'vitest';
import type { Habit, VaultEvent } from './types';
import {
  autoSummary,
  habitScheduleLabel,
  habitStreaks,
  isHabitDue,
  reduceHabits,
  reduceHabitLogs,
  sanitizeSummary,
  summaryWordCount,
  wellnessDigest,
} from './wellness';
import { addDays, todayISO } from './metrics';

function event(kind: string, payload: VaultEvent['payload'], timestamp = '2026-01-01T00:00:00.000Z'): VaultEvent {
  return { id: `${kind}-${Math.random()}`, device_id: 'test', timestamp, kind, payload };
}

const HABIT: Habit = {
  id: 'walk',
  name: 'Caminar',
  note: '',
  frequency: 'daily',
  days: [],
  timesPerWeek: 7,
  dayOfMonth: 1,
  points: 10,
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('wellness', () => {
  it('normaliza el resumen a cinco palabras', () => {
    expect(sanitizeSummary('  Hoy   me siento muy bien y con energía  ')).toBe('Hoy me siento muy bien');
    expect(summaryWordCount('Hoy me siento muy bien')).toBe(5);
    expect(summaryWordCount('')).toBe(0);
  });

  it('aplica altas, ediciones y bajas de hábitos', () => {
    const habits = reduceHabits([
      event('habit.saved', HABIT),
      event('habit.saved', { ...HABIT, name: 'Caminar 30 min', points: 15 }),
      event('habit.saved', { ...HABIT, id: 'other', name: 'Estirar' }),
      event('habit.deleted', { id: 'other' }),
    ]);
    expect(habits).toHaveLength(1);
    expect(habits[0]).toMatchObject({ id: 'walk', name: 'Caminar 30 min', points: 15 });
  });

  it('programa hábitos diarios, semanales y mensuales', () => {
    expect(isHabitDue(HABIT, '2026-10-29')).toBe(true);
    expect(isHabitDue({ ...HABIT, enabled: false }, '2026-10-29')).toBe(false);

    const weekly: Habit = { ...HABIT, frequency: 'weekly', days: [1, 3] };
    expect(isHabitDue(weekly, '2026-10-26')).toBe(true); // lunes
    expect(isHabitDue(weekly, '2026-10-27')).toBe(false);
    expect(habitScheduleLabel(weekly)).toBe('lun · mié');

    const monthly: Habit = { ...HABIT, frequency: 'monthly', dayOfMonth: 15 };
    expect(isHabitDue(monthly, '2026-10-15')).toBe(true);
    expect(isHabitDue(monthly, '2026-10-16')).toBe(false);
    expect(habitScheduleLabel(monthly)).toContain('15');
  });

  it('suma puntos una sola vez por hábito y día', () => {
    const today = todayISO();
    const logs = reduceHabitLogs([
      event('habit.logged', { habitId: 'walk', date: today, completed: true, points: 10 }),
      event('habit.logged', { habitId: 'walk', date: today, completed: false, points: 0 }),
    ]);
    expect(logs.size).toBe(1);
    expect(logs.get(`walk:${today}`)).toMatchObject({ completed: false, points: 0 });
  });

  it('calcula racha actual y mejor racha sin contar el futuro', () => {
    const now = new Date(2026, 9, 29, 12);
    const today = todayISO(now);
    const yesterday = todayISO(addDays(now, -1));
    const habits = [HABIT];
    const logs = reduceHabitLogs([
      event('habit.logged', { habitId: 'walk', date: yesterday, completed: true, points: 10 }),
      event('habit.logged', { habitId: 'walk', date: today, completed: true, points: 10 }),
      event('habit.logged', {
        habitId: 'walk',
        date: todayISO(addDays(now, -3)),
        completed: true,
        points: 10,
      }),
    ]);
    expect(habitStreaks(habits, logs, now)).toEqual({ streak: 2, bestStreak: 2 });
  });

  it('resume puntos, ánimo y semana', () => {
    const now = new Date(2026, 9, 29, 12);
    const today = todayISO(now);
    const digest = wellnessDigest(
      [
        event('habit.saved', HABIT),
        event('habit.logged', { habitId: 'walk', date: today, completed: true, points: 10 }),
        event('mood.logged', { date: today, mood: 5, note: 'Bien', summary: 'Día completo, buen ánimo' }),
      ],
      now,
    );
    expect(digest.dueToday).toBe(1);
    expect(digest.doneToday).toBe(1);
    expect(digest.pointsToday).toBe(10);
    expect(digest.moodToday?.mood).toBe(5);
    expect(digest.moodAverage7).toBe(5);
    expect(digest.week).toHaveLength(7);
    expect(digest.week.find((day) => day.date === today)?.points).toBe(10);
  });

  it('genera un resumen automático de cinco palabras o menos', () => {
    for (const summary of [
      autoSummary(0, 0, null),
      autoSummary(1, 3, 2),
      autoSummary(2, 2, 5),
      autoSummary(0, 2, 3),
    ]) {
      expect(summaryWordCount(summary)).toBeLessThanOrEqual(5);
    }
    expect(autoSummary(2, 2, 4)).toContain('Día completo');
  });
});
