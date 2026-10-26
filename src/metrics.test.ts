import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  latestMeasurement,
  reduceExercises,
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

  it('returns a measurement merged with defaults', () => {
    const latest = latestMeasurement([
      event('measurement.saved', { id: 'm', date: '2026-01-01', weight: 80 }),
    ]);
    expect(latest?.weight).toBe(80);
    expect(latest?.waist).toBe(0);
  });
});
