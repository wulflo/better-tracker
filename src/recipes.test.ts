import { describe, expect, it } from 'vitest';
import { RECIPES, recipeLogItems, recipeMacros, recommendRecipes } from './recipes';

describe('recetas', () => {
  it('calcula los macros con la misma base de alimentos que el diario', () => {
    for (const recipe of RECIPES) {
      const macros = recipeMacros(recipe);
      const items = recipeLogItems(recipe);
      const totals = items.reduce(
        (acc, item) => ({
          kcal: acc.kcal + item.kcal,
          protein: acc.protein + item.protein,
          carbs: acc.carbs + item.carbs,
          fat: acc.fat + item.fat,
          fiber: acc.fiber + item.fiber,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      );
      expect(macros.kcal).toBe(Math.round(totals.kcal / recipe.servings));
      expect(macros.protein).toBeCloseTo(totals.protein / recipe.servings, 1);
      expect(macros.carbs).toBeCloseTo(totals.carbs / recipe.servings, 1);
      expect(macros.fat).toBeCloseTo(totals.fat / recipe.servings, 1);
      expect(macros.fiber).toBeCloseTo(totals.fiber / recipe.servings, 1);
    }
  });

  it('prioriza recetas de déficit con alta proteína por caloría', () => {
    const suggestions = recommendRecipes('cut', { kcal: 500, protein: 40 }, 3);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0].goal).toBe('cut');
    expect(suggestions[0].macros.proteinPer100Kcal).toBeGreaterThan(6);
    expect(suggestions[0].score).toBeGreaterThanOrEqual(suggestions[1].score);
  });

  it('prioriza densidad energética en superávit', () => {
    const suggestions = recommendRecipes('bulk', { kcal: 900, protein: 40 }, 3);
    expect(suggestions[0].goal).toBe('bulk');
  });

  it('devuelve alimentos registrables con identificadores únicos', () => {
    const items = recipeLogItems(RECIPES[0], 'comida');
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(items.every((item) => item.meal === 'comida' && item.unit === 'g')).toBe(true);
  });
});
