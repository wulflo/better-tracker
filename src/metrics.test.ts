import { describe, expect, it } from 'vitest';
import {
  bodyProgressSeries,
  daysBetween,
  latestMeasurement,
  latestNutrition,
  reduceExercises,
  reduceNutrition,
  safeNum,
  startOfWeek,
  todayISO,
  visibleTrainingEvents,
} from './metrics';
import type { Exercise, VaultEvent } from './types';

function event(kind: string, payload: Record<string, unknown>, timestamp = '2026-01-01T00:00:00.000Z'): VaultEvent {
  return {
    id: `${kind}-${timestamp}`,
    device_id: 'test',
    timestamp,
    kind,
    payload,
  };
}

describe('metrics', () => {
  it('parses localized decimal input safely', () => {
    expect(safeNum('12,5')).toBe(12.5);
    expect(safeNum(' 8 ')).toBe(8);
    expect(safeNum('no-numero')).toBe(0);
  });

  it('computes calendar differences and Monday-based weeks', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(todayISO(startOfWeek(new Date(2026, 9, 28)))).toBe('2026-10-26');
  });

  it('applies exercise upserts and deletes deterministically', () => {
    const exercises = reduceExercises([
      event('exercise.upsert', { id: 'a', name: 'Sentadilla' } as unknown as Record<string, unknown>),
      event('exercise.upsert', { id: 'b', name: 'Press' } as unknown as Record<string, unknown>, '2026-01-02T00:00:00.000Z'),
      event('exercise.upsert', { id: 'a', name: 'Sentadilla frontal' } as unknown as Record<string, unknown>, '2026-01-03T00:00:00.000Z'),
      event('exercise.delete', { id: 'b' }, '2026-01-04T00:00:00.000Z'),
    ]);
    expect(exercises.map((e: Exercise) => [e.id, e.name])).toEqual([['a', 'Sentadilla frontal']]);
  });

  it('hides only training events before the last history cutoff', () => {
    const events = [
      event('session.saved', { id: 'old' }, '2025-12-01T00:00:00.000Z'),
      event('weight.logged', { id: 'w', date: '2025-12-01' }, '2025-12-01T00:00:00.000Z'),
      event('history.cleared', { at: '2026-01-01T00:00:00.000Z' }, '2026-01-01T00:00:00.000Z'),
      event('session.saved', { id: 'new' }, '2026-01-02T00:00:00.000Z'),
    ];
    const visible = visibleTrainingEvents(events);
    expect(visible.map((e) => e.kind)).toEqual(['weight.logged', 'history.cleared', 'session.saved']);
  });

  it('keeps only the latest nutrition log per day', () => {
    const events = [
      event('nutrition.logged', { date: '2026-01-01', kcal: 2000, protein: 120, carbs: 220, fat: 60, fiber: 25, water: 2000 }),
      event('nutrition.logged', { date: '2026-01-01', kcal: 2200, protein: 140, carbs: 240, fat: 65, fiber: 30, water: 2500 }, '2026-01-01T12:00:00.000Z'),
      event('nutrition.logged', { date: '2026-01-02', kcal: 2100, protein: 130, carbs: 230, fat: 62, fiber: 28, water: 2200 }, '2026-01-02T08:00:00.000Z'),
    ];
    expect(reduceNutrition(events)).toHaveLength(3);
    expect(latestNutrition(events, '2026-01-01')?.kcal).toBe(2200);
    expect(latestNutrition(events, '2026-01-02')?.protein).toBe(130);
  });

  it('builds a fat-progress series without requiring a scale', () => {
    const events = [
      event('measurement.saved', {
        date: '2026-01-01', sex: 'male', age: 35, height: 180, weight: 90,
        neck: 40, waist: 100, hip: 100, chest: 105, arm: 35, thigh: 60, calf: 39, wrist: 17,
      }),
      event('measurement.saved', {
        date: '2026-02-01', sex: 'male', age: 35, height: 180, weight: 86,
        neck: 39, waist: 94, hip: 98, chest: 103, arm: 34.5, thigh: 58, calf: 38.5, wrist: 17,
      }, '2026-02-01T00:00:00.000Z'),
    ];
    const series = bodyProgressSeries(events);
    expect(series).toHaveLength(2);
    expect(series[0].bodyFat).not.toBeNull();
    expect(series[1].bodyFat).not.toBeNull();
    expect(series[1].bodyFat as number).toBeLessThan(series[0].bodyFat as number);
    expect(series[1].fatMass).toBeCloseTo((series[1].weight as number) * (series[1].bodyFat as number) / 100, 5);

    const noScale = bodyProgressSeries([
      event('measurement.saved', { date: '2026-03-01', sex: 'female', age: 30, height: 165, neck: 33, waist: 80, hip: 100 }),
    ]);
    expect(noScale[0].bodyFat).not.toBeNull();
    expect(noScale[0].fatMass).toBeNull();
  });

  it('returns a measurement merged with defaults', () => {
    const latest = latestMeasurement([
      event('measurement.saved', { id: 'm', date: '2026-01-01', weight: 80 }),
    ]);
    expect(latest?.weight).toBe(80);
    expect(latest?.waist).toBe(0);
  });
});
