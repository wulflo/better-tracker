import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoodLogItem } from './types';
import { clearMealDraft, loadMealDraft, saveMealDraft } from './meals';

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const item: FoodLogItem = {
  id: 'a', foodId: 'platano', name: 'Plátano', category: 'fruta', meal: 'desayuno',
  quantity: 1, unit: 'unidad', grams: 120, kcal: 107, protein: 1.3, carbs: 27.4, fat: 0.4, fiber: 3.1,
};

describe('daily meal draft', () => {
  it('loads only today\'s draft and removes the previous day', () => {
    saveMealDraft('2026-10-25', [item]);
    expect(loadMealDraft('2026-10-26')).toEqual([]);
    expect(store['bt.meal.draft.v1']).toBeUndefined();

    saveMealDraft('2026-10-26', [item]);
    expect(loadMealDraft('2026-10-26')).toHaveLength(1);
    expect(loadMealDraft('2026-10-26')[0].name).toBe('Plátano');
  });

  it('clears the draft when it is empty or explicitly cleared', () => {
    saveMealDraft('2026-10-26', [item]);
    clearMealDraft();
    expect(loadMealDraft('2026-10-26')).toEqual([]);

    saveMealDraft('2026-10-26', [item]);
    saveMealDraft('2026-10-26', []);
    expect(store['bt.meal.draft.v1']).toBeUndefined();
  });
});
