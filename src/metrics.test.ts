import { describe, expect, it } from 'vitest';
import {
  bodyComposition,
  bodyProgressSeries,
  computeMacros,
  computeSatiety,
  computeWaterGuidance,
  daysBetween,
  goalModeFromEvents,
  latestMeasurement,
  latestNutrition,
  reduceExercises,
  reduceNutrition,
  safeNum,
  startOfWeek,
  todayISO,
  visibleTrainingEvents,
} from './metrics';
import type { BodyMeasures, Exercise, VaultEvent } from './types';

const BODY: BodyMeasures = {
  sex: 'male',
  age: 30,
  weight: 80,
  height: 180,
  neck: 38,
  chest: 102,
  waist: 85,
  hip: 96,
  arm: 33,
  thigh: 56,
  calf: 38,
  wrist: 17,
};

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

  it('uses the declared activity level exactly once', () => {
    const base = computeMacros(BODY, 30, 'maintain');
    const auto = computeMacros(BODY, 30, 'maintain', 'auto');
    const moderate = computeMacros(BODY, 30, 'maintain', 'moderate');
    const high = computeMacros(BODY, 30, 'maintain', 'high');
    expect(base).not.toBeNull();
    expect(auto).not.toBeNull();
    expect(moderate).not.toBeNull();
    expect(high).not.toBeNull();
    expect(auto!.activity).toBe(base!.activity);
    expect(auto!.tdee).toBe(base!.tdee);
    expect(moderate!.activity).toBeCloseTo(1.55, 2);
    expect(moderate!.tdee).toBeGreaterThan(base!.tdee);
    expect(high!.tdee).toBeGreaterThan(moderate!.tdee);
  });

  it('applies the selected goal as a calorie deficit or surplus', () => {
    const maintain = computeMacros(BODY, 180, 'maintain', 'moderate')!;
    const cut = computeMacros(BODY, 180, 'cut', 'moderate')!;
    const bulk = computeMacros(BODY, 180, 'bulk', 'moderate')!;
    expect(maintain.kcal).toBe(maintain.tdee);
    expect(cut.kcal).toBeLessThan(cut.tdee);
    expect(bulk.kcal).toBeGreaterThan(bulk.tdee);
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

  it('restores the last saved goal mode from the vault', () => {
    expect(goalModeFromEvents([])).toBe('maintain');
    const events = [
      event('goal.mode', { mode: 'maintain' }, '2026-01-01T00:00:00.000Z'),
      event('goal.mode', { mode: 'cut' }, '2026-01-02T00:00:00.000Z'),
      event('goal.mode', { mode: 'bulk' }, '2026-01-03T00:00:00.000Z'),
      event('goal.mode', { mode: 'cut' }, '2026-01-04T00:00:00.000Z'),
    ];
    expect(goalModeFromEvents(events)).toBe('cut');
  });

  it('keeps the day macros when only water is updated', () => {
    const events = [
      event('nutrition.logged', { date: '2026-01-01', kcal: 2100, protein: 130, carbs: 240, fat: 68, fiber: 28, water: 1000 }),
      event('nutrition.logged', { date: '2026-01-01', kcal: 2100, protein: 130, carbs: 240, fat: 68, fiber: 28, water: 1500 }, '2026-01-01T12:00:00.000Z'),
    ];
    const today = latestNutrition(events, '2026-01-01');
    expect(today?.water).toBe(1500);
    expect(today?.kcal).toBe(2100);
    expect(today?.protein).toBe(130);
  });

  it('returns a measurement merged with defaults', () => {
    const latest = latestMeasurement([
      event('measurement.saved', { id: 'm', date: '2026-01-01', weight: 80 }),
    ]);
    expect(latest?.weight).toBe(80);
    expect(latest?.waist).toBe(0);
  });

  it('personalizes water limits with lean mass and training', () => {
    const comp = bodyComposition(BODY);
    expect(comp.leanMass).not.toBeNull();

    const rest = computeWaterGuidance(BODY, 0, 0);
    const trained = computeWaterGuidance(BODY, 420, 0);
    expect(rest.targetMl).toBeGreaterThan(2000);
    expect(trained.targetMl).toBeGreaterThan(rest.targetMl);
    expect(trained.safeMaxMl).toBeGreaterThan(trained.targetMl);
    expect(trained.hardMaxMl).toBeGreaterThan(trained.safeMaxMl);

    const within = computeWaterGuidance(BODY, 0, rest.targetMl);
    expect(within.status).toBe('ok');
    expect(within.tone).toBe('success');

    const excessive = computeWaterGuidance(BODY, 0, rest.safeMaxMl + 250);
    expect(excessive.status).toBe('excess');
    expect(excessive.tone).toBe('danger');

    const dangerous = computeWaterGuidance(BODY, 0, rest.hardMaxMl + 500);
    expect(dangerous.status).toBe('danger');
    expect(dangerous.message).toMatch(/sobrehidratación/i);
  });

  it('scores satiety from protein, fiber, volume, water and energy density', () => {
    const macros = computeMacros(BODY, 300, 'maintain');
    expect(macros).not.toBeNull();
    const comp = bodyComposition(BODY);

    const poor = computeSatiety(
      { date: '2026-01-01', kcal: 1800, protein: 45, carbs: 240, fat: 70, fiber: 5, water: 400 },
      macros,
      { grams: 500, weightKg: BODY.weight, bodyFat: comp.avg, leanMass: comp.leanMass, weeklyMinutes: 300 },
    );
    const good = computeSatiety(
      { date: '2026-01-01', kcal: 2100, protein: 145, carbs: 230, fat: 65, fiber: 32, water: 2600 },
      macros,
      { grams: 1600, weightKg: BODY.weight, bodyFat: comp.avg, leanMass: comp.leanMass, weeklyMinutes: 300 },
    );

    expect(poor).not.toBeNull();
    expect(good).not.toBeNull();
    expect(good!.score).toBeGreaterThan(poor!.score);
    expect(good!.energyDensity).toBeLessThan(poor!.energyDensity as number);
    expect(good!.drivers).toHaveLength(6);
    expect(good!.diagnosis).toMatch(/saciedad/i);
  });
});
