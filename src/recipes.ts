/**
 * Recomendador de recetas basado en evidencia.
 *
 * Las recetas se construyen con los mismos alimentos y macros que la base de
 * datos (`FOODS`), así que los números que muestra el recomendador son
 * exactamente los que se registran al añadir la receta al diario. No hay una
 * segunda tabla nutricional que pueda desincronizarse.
 *
 * Criterios:
 *  - Déficit: alta proteína (≥1,6–2,2 g/kg), fibra y volumen, densidad
 *    energética baja. La proteína y la fibra son los mejores predictores de
 *    saciedad y de preservación de masa magra en déficit.
 *  - Mantenimiento: reparto equilibrado y variedad de fuentes.
 *  - Superávit: densidad energética moderada-alta y carbohidratos alrededor del
 *    entrenamiento para favorecer la ganancia de peso sin exceso de grasa.
 */
import type { Food, FoodLogItem, GoalMode, MealSlot } from './types';
import { FOODS, calcFood } from './foodDb';

export interface RecipeIngredient {
  foodId: string;
  grams: number;
}

export interface Recipe {
  id: string;
  name: string;
  goal: GoalMode;
  meal: MealSlot;
  description: string;
  science: string;
  minutes: number;
  servings: number;
  tags: string[];
  ingredients: RecipeIngredient[];
}

export interface RecipeMacros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  grams: number;
  proteinPer100Kcal: number;
  fiberPer100Kcal: number;
}

export interface RecipeSuggestion extends Recipe {
  macros: RecipeMacros;
  fit: 'excellent' | 'good' | 'ok';
  score: number;
}

export const RECIPES: Recipe[] = [
  // ---------------------------------------------------------------- déficit
  {
    id: 'cut-chicken-rice',
    name: 'Bowl de pollo, arroz integral y brócoli',
    goal: 'cut',
    meal: 'comida',
    description: 'Comida completa con proteína magra, carbohidrato integral y verdura voluminosa.',
    science: 'La proteína magra y la fibra del brócoli aumentan la saciedad por caloría; el arroz integral aporta energía estable para entrenar.',
    minutes: 20,
    servings: 1,
    tags: ['alto en proteína', 'meal prep'],
    ingredients: [
      { foodId: 'pollo_pechuga', grams: 150 },
      { foodId: 'arroz_integral', grams: 150 },
      { foodId: 'brocoli', grams: 150 },
      { foodId: 'aceite_oliva', grams: 5 },
    ],
  },
  {
    id: 'cut-oats-protein',
    name: 'Avena proteica con fresas y chía',
    goal: 'cut',
    meal: 'desayuno',
    description: 'Desayuno rápido, dulce y con proteína y fibra suficientes para llegar a la comida.',
    science: 'La avena y la chía aportan fibra soluble (beta-glucano) que enlentece el vaciado gástrico; el suero completa el perfil de aminoácidos.',
    minutes: 8,
    servings: 1,
    tags: ['fibra', 'rápido'],
    ingredients: [
      { foodId: 'avena', grams: 50 },
      { foodId: 'leche_desnatada', grams: 200 },
      { foodId: 'proteina_suero', grams: 25 },
      { foodId: 'fresa', grams: 120 },
      { foodId: 'chia', grams: 10 },
    ],
  },
  {
    id: 'cut-salmon-potato',
    name: 'Salmón al horno con patata y espinaca',
    goal: 'cut',
    meal: 'cena',
    description: 'Cena saciante con omega-3, potasio y verdura de hoja verde.',
    science: 'El salmón aporta EPA/DHA y proteína completa; la patata cocida tiene un índice de saciedad alto por su contenido en agua y almidón resistente.',
    minutes: 30,
    servings: 1,
    tags: ['omega-3', 'sin gluten'],
    ingredients: [
      { foodId: 'salmon', grams: 130 },
      { foodId: 'patata', grams: 200 },
      { foodId: 'espinaca', grams: 100 },
      { foodId: 'aceite_oliva', grams: 5 },
    ],
  },
  {
    id: 'cut-yogurt-bowl',
    name: 'Yogur griego con plátano y nueces',
    goal: 'cut',
    meal: 'snack',
    description: 'Snack con proteína, potasio y una porción pequeña de grasa saludable.',
    science: 'El yogur griego duplica la proteína del yogur normal; las nueces añaden ácidos grasos y fibra con una porción controlada.',
    minutes: 5,
    servings: 1,
    tags: ['snack', 'proteico'],
    ingredients: [
      { foodId: 'yogur_griego', grams: 170 },
      { foodId: 'platano', grams: 100 },
      { foodId: 'nuez', grams: 15 },
      { foodId: 'avena', grams: 20 },
    ],
  },

  // ---------------------------------------------------------- mantenimiento
  {
    id: 'maintain-pasta-tuna',
    name: 'Pasta integral con atún y tomate',
    goal: 'maintain',
    meal: 'comida',
    description: 'Plato equilibrado con carbohidrato, proteína y licopeno.',
    science: 'Reparto de macros cercano al 30/40/30: suficiente proteína para mantener masa magra y carbohidrato para reponer glucógeno.',
    minutes: 18,
    servings: 1,
    tags: ['equilibrado', 'económico'],
    ingredients: [
      { foodId: 'pasta_integral', grams: 180 },
      { foodId: 'atun_agua', grams: 120 },
      { foodId: 'tomate', grams: 150 },
      { foodId: 'aceite_oliva', grams: 10 },
    ],
  },
  {
    id: 'maintain-turkey-tacos',
    name: 'Tacos de pavo, alubias y aguacate',
    goal: 'maintain',
    meal: 'cena',
    description: 'Tres tacos con proteína magra, legumbre y grasa saludable.',
    science: 'La combinación de cereal y legumbre mejora el perfil de aminoácidos y aporta fibra fermentable beneficiosa para la microbiota.',
    minutes: 22,
    servings: 1,
    tags: ['fibra', 'mexicano'],
    ingredients: [
      { foodId: 'tortilla_maiz', grams: 90 },
      { foodId: 'pavo_pechuga', grams: 150 },
      { foodId: 'alubias', grams: 120 },
      { foodId: 'pimiento', grams: 80 },
      { foodId: 'aguacate', grams: 40 },
    ],
  },
  {
    id: 'maintain-tofu-quinoa',
    name: 'Tofu salteado con quinoa y pimiento',
    goal: 'maintain',
    meal: 'comida',
    description: 'Opción vegetal completa, rica en fibra y sin colesterol.',
    science: 'La soja es una proteína vegetal completa; la quinoa complementa con aminoácidos y la verdura aporta vitamina C y fibra.',
    minutes: 20,
    servings: 1,
    tags: ['vegetariano', 'fibra'],
    ingredients: [
      { foodId: 'tofu', grams: 180 },
      { foodId: 'quinoa_cocida', grams: 180 },
      { foodId: 'pimiento', grams: 100 },
      { foodId: 'aceite_oliva', grams: 8 },
    ],
  },
  {
    id: 'maintain-tortilla',
    name: 'Tortilla de patata con ensalada verde',
    goal: 'maintain',
    meal: 'cena',
    description: 'Clásico saciante con huevo, patata y hoja verde.',
    science: 'El huevo tiene el mejor perfil de aminoácidos de referencia y la patata cocida es uno de los alimentos con mayor índice de saciedad.',
    minutes: 25,
    servings: 1,
    tags: ['huevo', 'saciante'],
    ingredients: [
      { foodId: 'huevo', grams: 150 },
      { foodId: 'patata', grams: 150 },
      { foodId: 'espinaca', grams: 60 },
      { foodId: 'aceite_oliva', grams: 8 },
    ],
  },

  // ------------------------------------------------------------- superávit
  {
    id: 'bulk-shake',
    name: 'Batido de avena, plátano y cacahuete',
    goal: 'bulk',
    meal: 'desayuno',
    description: 'Desayuno líquido denso en energía para días de mucho volumen.',
    science: 'Los líquidos permiten ingerir más calorías sin saciedad excesiva; la avena y el plátano reponen glucógeno y el suero añade proteína.',
    minutes: 5,
    servings: 1,
    tags: ['alto en calorías', 'post-entreno'],
    ingredients: [
      { foodId: 'avena', grams: 80 },
      { foodId: 'leche_entera', grams: 300 },
      { foodId: 'platano', grams: 120 },
      { foodId: 'crema_cacahuete', grams: 20 },
      { foodId: 'proteina_suero', grams: 30 },
    ],
  },
  {
    id: 'bulk-beef-rice',
    name: 'Arroz con ternera y aguacate',
    goal: 'bulk',
    meal: 'comida',
    description: 'Comida densa con proteína completa, carbohidrato y grasa monoinsaturada.',
    science: 'Un superávit moderado (≈10 %) con 1,6–2,2 g/kg de proteína maximiza la síntesis proteica y limita la ganancia de grasa.',
    minutes: 25,
    servings: 1,
    tags: ['alto en calorías', 'fuerza'],
    ingredients: [
      { foodId: 'arroz_blanco', grams: 250 },
      { foodId: 'filete_ternera', grams: 180 },
      { foodId: 'aguacate', grams: 60 },
      { foodId: 'aceite_oliva', grams: 8 },
    ],
  },
  {
    id: 'bulk-pasta-salmon',
    name: 'Pasta con salmón y parmesano',
    goal: 'bulk',
    meal: 'cena',
    description: 'Cena energética con omega-3 y proteína de alta calidad.',
    science: 'La pasta alrededor del entrenamiento favorece la recuperación; el salmón aporta grasa antiinflamatoria y el parmesano calcio y umami.',
    minutes: 22,
    servings: 1,
    tags: ['omega-3', 'recuperación'],
    ingredients: [
      { foodId: 'pasta', grams: 220 },
      { foodId: 'salmon', grams: 160 },
      { foodId: 'tomate', grams: 100 },
      { foodId: 'aceite_oliva', grams: 12 },
      { foodId: 'queso_parmesano', grams: 10 },
    ],
  },
  {
    id: 'bulk-eggs-toast',
    name: 'Huevos, pan integral y crema de cacahuete',
    goal: 'bulk',
    meal: 'desayuno',
    description: 'Desayuno sólido con proteína, grasa y carbohidrato para empezar con energía.',
    science: 'Reparte la proteína en 3–4 tomas de 0,4 g/kg para estimular la síntesis proteica a lo largo del día; este desayuno cubre una de ellas.',
    minutes: 12,
    servings: 1,
    tags: ['proteico', 'rápido'],
    ingredients: [
      { foodId: 'huevo', grams: 150 },
      { foodId: 'pan_integral', grams: 70 },
      { foodId: 'mantequilla_cacahuete', grams: 20 },
      { foodId: 'platano', grams: 100 },
    ],
  },
];

const FOOD_MAP = new Map(FOODS.map((food) => [food.id, food]));

export function recipeFoods(recipe: Recipe): Array<{ food: Food; grams: number }> {
  return recipe.ingredients
    .map((ingredient) => {
      const food = FOOD_MAP.get(ingredient.foodId);
      return food ? { food, grams: ingredient.grams } : null;
    })
    .filter((entry): entry is { food: Food; grams: number } => entry !== null);
}

export function recipeMacros(recipe: Recipe): RecipeMacros {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, grams: 0 };
  for (const { food, grams } of recipeFoods(recipe)) {
    const value = calcFood(food, grams, 'g');
    totals.kcal += value.kcal;
    totals.protein += value.protein;
    totals.carbs += value.carbs;
    totals.fat += value.fat;
    totals.fiber += value.fiber;
    totals.grams += value.grams;
  }
  const servings = Math.max(1, recipe.servings || 1);
  const kcal = Math.round(totals.kcal / servings);
  return {
    kcal,
    protein: round1(totals.protein / servings),
    carbs: round1(totals.carbs / servings),
    fat: round1(totals.fat / servings),
    fiber: round1(totals.fiber / servings),
    grams: Math.round(totals.grams / servings),
    proteinPer100Kcal: kcal > 0 ? round1(((totals.protein / servings) * 100) / kcal) : 0,
    fiberPer100Kcal: kcal > 0 ? round1(((totals.fiber / servings) * 100) / kcal) : 0,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface RemainingMacros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Ordena las recetas por encima del objetivo y por ajuste a lo que queda del
 * día. `remaining` es opcional: sin diario, prioriza el criterio del objetivo.
 */
export function recommendRecipes(
  goal: GoalMode,
  remaining?: Partial<RemainingMacros> | null,
  limit = 4,
): RecipeSuggestion[] {
  return RECIPES.map((recipe) => {
    const macros = recipeMacros(recipe);
    let score = recipe.goal === goal ? 60 : 20;
    const proteinPerKg = macros.proteinPer100Kcal;

    if (goal === 'cut') {
      score += Math.min(22, proteinPerKg * 11);
      score += Math.min(8, macros.fiberPer100Kcal * 18);
      if (macros.kcal > 750) score -= 10;
    } else if (goal === 'bulk') {
      score += Math.min(14, macros.kcal / 60);
      score += Math.min(10, macros.protein * 0.18);
      if (macros.kcal < 450) score -= 6;
    } else {
      score += Math.min(12, macros.protein * 0.2);
      score += Math.min(8, macros.fiber * 0.4);
    }

    if (remaining) {
      const kcal = Math.max(0, Number(remaining.kcal) || 0);
      const protein = Math.max(0, Number(remaining.protein) || 0);
      if (kcal > 0) {
        score += Math.max(0, 18 - (Math.abs(macros.kcal - kcal) / Math.max(200, kcal)) * 18);
      }
      if (protein > 0) {
        score += Math.max(0, 16 - (Math.abs(macros.protein - protein * 0.5) / Math.max(15, protein)) * 16);
      }
    }

    const fit: RecipeSuggestion['fit'] = score >= 82 ? 'excellent' : score >= 62 ? 'good' : 'ok';
    return { ...recipe, macros, fit, score: Math.round(score) };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `recipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Convierte una receta en alimentos registrables, usando el mismo motor de macros. */
export function recipeLogItems(recipe: Recipe, meal: MealSlot = recipe.meal): FoodLogItem[] {
  const servings = Math.max(1, recipe.servings || 1);
  return recipeFoods(recipe).map(({ food, grams }) => {
    const perServing = grams / servings;
    const value = calcFood(food, perServing, 'g');
    return {
      id: newId(),
      foodId: food.id,
      name: food.name,
      category: food.category,
      meal,
      quantity: perServing,
      unit: 'g',
      ...value,
    };
  });
}

export function goalLabel(goal: GoalMode): string {
  return goal === 'cut' ? 'Déficit' : goal === 'bulk' ? 'Superávit' : 'Mantenimiento';
}
