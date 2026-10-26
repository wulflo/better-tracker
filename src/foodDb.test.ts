import { describe, expect, it } from 'vitest';
import type { Food, FoodLogItem, VaultEvent } from './types';
import { FOODS, calcFood, foodUnits, mealTotals, reduceCustomFoods, searchFoods } from './foodDb';

function event(kind: string, payload: Record<string, unknown>, timestamp = '2026-01-01T00:00:00.000Z'): VaultEvent {
  return { id: `${kind}-${timestamp}`, device_id: 'test', timestamp, kind, payload };
}

describe('food database', () => {
  it('bundles hundreds of common foods with gram and portion units', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(180);
    const chicken = FOODS.find((food) => food.id === 'pollo_pechuga');
    expect(chicken).toBeTruthy();
    expect(foodUnits(chicken as Food)).toContain('g');
    expect(foodUnits(chicken as Food)).toContain('filete');
    expect(FOODS.every((food) => food.name && food.per100.kcal >= 0)).toBe(true);
  });

  it('calculates grams and macros dynamically for different measures', () => {
    const chicken = FOODS.find((food) => food.id === 'pollo_pechuga') as Food;
    const grams = calcFood(chicken, 150, 'g');
    expect(grams.grams).toBe(150);
    expect(grams.kcal).toBe(248);
    expect(grams.protein).toBe(46.5);

    const fillet = calcFood(chicken, 1, 'filete');
    expect(fillet.grams).toBe(120);
    expect(fillet.kcal).toBe(198);
    expect(fillet.protein).toBe(37.2);

    const oil = FOODS.find((food) => food.id === 'aceite_oliva') as Food;
    expect(calcFood(oil, 1, 'cucharada').grams).toBe(14);
  });

  it('totals the daily meal draft', () => {
    const items: FoodLogItem[] = [
      {
        id: 'a', foodId: 'pollo_pechuga', name: 'Pollo', category: 'carne', meal: 'comida',
        quantity: 150, unit: 'g', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0,
      },
      {
        id: 'b', foodId: 'arroz_blanco', name: 'Arroz', category: 'cereal', meal: 'comida',
        quantity: 1, unit: 'taza', grams: 158, kcal: 205, protein: 4.3, carbs: 44.6, fat: 0.5, fiber: 0.6,
      },
    ];
    expect(mealTotals(items)).toEqual({
      kcal: 453,
      protein: 50.8,
      carbs: 44.6,
      fat: 5.9,
      fiber: 0.6,
    });
  });

  it('keeps custom foods from the latest saved event', () => {
    const base: Food = {
      id: 'custom-1', name: 'Tortilla casera', category: 'otro',
      per100: { kcal: 200, protein: 10, carbs: 20, fat: 9, fiber: 1 }, units: {},
    };
    const changed: Food = { ...base, name: 'Tortilla de casa', per100: { ...base.per100, kcal: 210 } };
    const foods = reduceCustomFoods([
      event('food.saved', base as unknown as Record<string, unknown>),
      event('food.saved', changed as unknown as Record<string, unknown>, '2026-01-02T00:00:00.000Z'),
    ]);
    expect(foods).toHaveLength(1);
    expect(foods[0].name).toBe('Tortilla de casa');
    expect(foods[0].per100.kcal).toBe(210);
    expect(foods[0].custom).toBe(true);
  });

  it('searches names without accents being mandatory', () => {
    const results = searchFoods(FOODS, 'platano');
    expect(results.some((food) => food.id === 'platano')).toBe(true);
  });
});
