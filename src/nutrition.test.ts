import { describe, expect, it } from 'vitest';
import type { NutritionEntry } from './types';
import { nutritionDigest, weeklyNutritionStats } from './nutrition';
import { addDays, todayISO } from './metrics';

const NOW = new Date(2026, 9, 29, 12); // jueves 29 de octubre de 2026

function entry(date: string, kcal: number, protein = 120, water = 2000): NutritionEntry {
  return { date, kcal, protein, carbs: 200, fat: 60, fiber: 25, water };
}

const TARGETS = { kcal: 2200, protein: 150, carbs: 220, fat: 70, fiber: 30, water: 2500 };

describe('nutrición', () => {
  it('agrupa por semanas de lunes a domingo', () => {
    const weeks = weeklyNutritionStats(
      [entry('2026-10-26', 2100), entry('2026-10-28', 2300)],
      2,
      NOW,
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[1].start).toBe('2026-10-26');
    expect(weeks[1].end).toBe('2026-11-01');
    expect(weeks[1].loggedDays).toBe(2);
  });

  it('promedia solo días con registro y calcula mínimos y máximos', () => {
    const entries = [
      entry('2026-10-26', 2000, 140),
      entry('2026-10-28', 2400, 160),
      entry('2026-10-20', 1800, 100),
    ];
    const digest = nutritionDigest(entries, 2, NOW, TARGETS);
    expect(digest.loggedDays).toBe(3);
    expect(digest.avg.kcal).toBe(Math.round((2000 + 2400 + 1800) / 3));
    expect(digest.avg.protein).toBe(Math.round((140 + 160 + 100) / 3));
    expect(digest.min.min).toBe(1800);
    expect(digest.min.max).toBe(2400);
    expect(digest.ranges.protein.min).toBe(100);
    expect(digest.ranges.protein.max).toBe(160);
    expect(digest.ranges.kcal.avg).toBeCloseTo((2000 + 2400 + 1800) / 3, 1);
    expect(digest.weeks.filter((week) => week.loggedDays > 0)).toHaveLength(2);
  });

  it('calcula adherencia dentro de ±10 % del objetivo', () => {
    const entries = [
      entry('2026-10-26', 2200),
      entry('2026-10-27', 2300),
      entry('2026-10-28', 3000),
    ];
    const digest = nutritionDigest(entries, 1, NOW, TARGETS);
    expect(digest.adherencePct).toBe(67);
    expect(digest.weeks[0].adherencePct).toBe(67);
  });

  it('sugiere mejoras cuando la proteína o la fibra quedan bajas', () => {
    const digest = nutritionDigest([{ ...entry('2026-10-28', 2600, 80), fiber: 10 }], 1, NOW, TARGETS);
    expect(digest.tips.some((tip) => tip.includes('proteína media'))).toBe(true);
    expect(digest.tips.some((tip) => tip.includes('fibra media'))).toBe(true);
  });

  it('no inventa promedios sin registros', () => {
    const digest = nutritionDigest([], 4, NOW, TARGETS);
    expect(digest.loggedDays).toBe(0);
    expect(digest.avg.kcal).toBe(0);
    expect(digest.bestWeek).toBeNull();
    expect(digest.tips[0]).toContain('Registra');
  });

  it('detecta la racha de días registrados terminando hoy o ayer', () => {
    const today = todayISO(new Date());
    const digest = nutritionDigest(
      [entry(todayISO(addDays(new Date(), -1)), 2000), entry(today, 2100)],
      1,
    );
    expect(digest.longestStreak).toBe(2);
  });
});
