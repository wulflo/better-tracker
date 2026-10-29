import type { NutritionEntry, VaultEvent } from './types';
import { addDays, reduceNutrition, startOfWeek, todayISO } from './metrics';

export interface MacroRange {
  min: number;
  max: number;
  avg: number;
}

export interface NutritionTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  water: number;
}

export interface NutritionWeekStats {
  key: string;
  label: string;
  start: string;
  end: string;
  loggedDays: number;
  entries: NutritionEntry[];
  totals: MacroRange;
  kcal: MacroRange;
  protein: MacroRange;
  carbs: MacroRange;
  fat: MacroRange;
  fiber: MacroRange;
  water: MacroRange;
  avgProteinPerKg: number | null;
  adherencePct: number | null;
}

export interface NutritionDigest {
  weeks: NutritionWeekStats[];
  loggedDays: number;
  avg: MacroRange & {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    water: number;
  };
  /** Rango real (mín./máx./media) de cada macro en los días con registro. */
  ranges: Record<MacroKey, MacroRange>;
  min: NutritionWeekStats['kcal'];
  max: NutritionWeekStats['kcal'];
  bestWeek: NutritionWeekStats | null;
  worstWeek: NutritionWeekStats | null;
  tips: string[];
  adherencePct: number | null;
  longestStreak: number;
}

const EMPTY_RANGE: MacroRange = { min: 0, max: 0, avg: 0 };
const MACROS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'water'] as const;
type MacroKey = (typeof MACROS)[number];

/** Solo cuenta días con registro real; los días sin log no entran en promedios. */
export function dailyNutrition(events: VaultEvent[]): NutritionEntry[] {
  const byDate = new Map<string, NutritionEntry>();
  for (const entry of reduceNutrition(events)) {
    if (!entry?.date) continue;
    byDate.set(entry.date, {
      ...entry,
      kcal: Math.max(0, Number(entry.kcal) || 0),
      protein: Math.max(0, Number(entry.protein) || 0),
      carbs: Math.max(0, Number(entry.carbs) || 0),
      fat: Math.max(0, Number(entry.fat) || 0),
      fiber: Math.max(0, Number(entry.fiber) || 0),
      water: Math.max(0, Number(entry.water) || 0),
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function range(values: number[]): MacroRange {
  if (!values.length) return { ...EMPTY_RANGE };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
  };
}

function sum(entries: NutritionEntry[], key: MacroKey): number {
  return entries.reduce((total, entry) => total + (Number(entry[key]) || 0), 0);
}

function weekStats(
  key: string,
  start: Date,
  entries: NutritionEntry[],
  targets?: NutritionTargets,
  weightKg?: number,
): NutritionWeekStats {
  const end = addDays(start, 6);
  const byMacro = Object.fromEntries(
    MACROS.map((macro) => [macro, range(entries.map((entry) => Number(entry[macro]) || 0))]),
  ) as Record<MacroKey, MacroRange>;
  const withinTarget =
    targets && targets.kcal > 0
      ? entries.filter((entry) => Math.abs(entry.kcal - targets.kcal) <= targets.kcal * 0.1).length
      : null;

  return {
    key,
    label: start.toLocaleDateString('es', { day: '2-digit', month: 'short' }),
    start: todayISO(start),
    end: todayISO(end),
    loggedDays: entries.length,
    entries,
    totals: range(entries.map((entry) => entry.kcal)),
    kcal: byMacro.kcal,
    protein: byMacro.protein,
    carbs: byMacro.carbs,
    fat: byMacro.fat,
    fiber: byMacro.fiber,
    water: byMacro.water,
    avgProteinPerKg:
      weightKg && weightKg > 0 && entries.length
        ? sum(entries, 'protein') / entries.length / weightKg
        : null,
    adherencePct:
      targets && targets.kcal > 0 && entries.length
        ? Math.round(((withinTarget ?? 0) / entries.length) * 100)
        : null,
  };
}

/**
 * Agrupa los logs por semana (lunes a domingo). Los promedios dividen solo por
 * días con registro, no por siete, para no infravalorar a quien registra de
 * forma intermitente.
 */
export function weeklyNutritionStats(
  entries: NutritionEntry[],
  weeks = 8,
  now = new Date(),
  targets?: NutritionTargets,
  weightKg?: number,
): NutritionWeekStats[] {
  const list: NutritionWeekStats[] = [];
  const base = startOfWeek(now);
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = addDays(base, -index * 7);
    const startKey = todayISO(start);
    const endKey = todayISO(addDays(start, 6));
    const inWeek = entries.filter((entry) => entry.date >= startKey && entry.date <= endKey);
    list.push(weekStats(startKey, start, inWeek, targets, weightKg));
  }
  return list;
}

export function nutritionDigest(
  entries: NutritionEntry[],
  weeks = 8,
  now = new Date(),
  targets?: NutritionTargets,
  weightKg?: number,
): NutritionDigest {
  const weeksList = weeklyNutritionStats(entries, weeks, now, targets, weightKg);
  const all = entries.filter((entry) => {
    if (!weeksList.length) return false;
    return entry.date >= weeksList[0].start && entry.date <= weeksList[weeksList.length - 1].end;
  });
  const averages = Object.fromEntries(
    MACROS.map((macro) => [
      macro,
      all.length ? sum(all, macro) / all.length : 0,
    ]),
  ) as Record<MacroKey, number>;
  const kcalRange = range(all.map((entry) => entry.kcal));
  const ranges = Object.fromEntries(
    MACROS.map((macro) => [macro, range(all.map((entry) => Number(entry[macro]) || 0))]),
  ) as Record<MacroKey, MacroRange>;
  const withData = weeksList.filter((week) => week.loggedDays > 0);
  const bestWeek = withData.length
    ? withData.reduce((best, week) => (week.loggedDays > best.loggedDays ? week : best))
    : null;
  const worstWeek = withData.length
    ? withData.reduce((worst, week) => (week.loggedDays < worst.loggedDays ? week : worst))
    : null;
  const adherencePct =
    targets && targets.kcal > 0 && all.length
      ? Math.round(
          (all.filter((entry) => Math.abs(entry.kcal - targets.kcal) <= targets.kcal * 0.1).length /
            all.length) *
            100,
        )
      : null;

  const tips: string[] = [];
  if (!all.length) {
    tips.push('Registra al menos un día para empezar a ver promedios y rangos.');
  } else {
    if (all.length < weeksList.length * 4) {
      tips.push(
        `Has registrado ${all.length} de los últimos ${weeksList.length * 7} días. Para que los promedios sean fiables, intenta registrar al menos 5 días por semana.`,
      );
    }
    if (targets) {
      if (averages.protein < targets.protein * 0.9) {
        tips.push(
          `La proteína media (${Math.round(averages.protein)} g) está por debajo del objetivo (${targets.protein} g). Añade una fuente proteica en desayuno o cena.`,
        );
      }
      if (averages.fiber < Math.max(20, targets.fiber * 0.8)) {
        tips.push(
          `La fibra media (${Math.round(averages.fiber)} g) es baja. Verduras, legumbres y fruta entera ayudan a la saciedad y al tránsito intestinal.`,
        );
      }
      if (averages.water > 0 && averages.water < targets.water * 0.8) {
        tips.push(
          `El agua media (${(averages.water / 1000).toFixed(1)} L) queda por debajo del objetivo (${(targets.water / 1000).toFixed(1)} L).`,
        );
      }
      const diff = averages.kcal - targets.kcal;
      if (Math.abs(diff) > targets.kcal * 0.12) {
        tips.push(
          diff > 0
            ? `La ingesta media supera el objetivo en ${Math.round(diff)} kcal/día. Revisa porciones y bebidas con calorías.`
            : `La ingesta media queda ${Math.round(-diff)} kcal/día por debajo del objetivo. Si buscas mantener o ganar, añade una comida estructurada.`,
        );
      }
      if (adherencePct !== null && adherencePct < 60) {
        tips.push('Menos de 6 de cada 10 días quedan a ±10 % de las calorías objetivo. La constancia importa más que la perfección diaria.');
      }
    }
    if (averages.fat > 0 && averages.fat * 9 > averages.kcal * 0.4) {
      tips.push('La grasa aporta más del 40 % de las calorías medias. Prioriza aceite de oliva, frutos secos y pescado sin desplazar proteína y fibra.');
    }
    if (averages.carbs > 0 && averages.carbs * 4 > averages.kcal * 0.6) {
      tips.push('Los carbohidratos aportan más del 60 % de las calorías medias. Combínalos con proteína y verdura para mejorar la saciedad.');
    }
    tips.push('Los promedios son orientativos: una semana aislada no define el progreso. Mira la tendencia de 3-4 semanas.');
  }

  return {
    weeks: weeksList,
    loggedDays: all.length,
    avg: {
      kcal: Math.round(averages.kcal),
      protein: Math.round(averages.protein),
      carbs: Math.round(averages.carbs),
      fat: Math.round(averages.fat),
      fiber: Math.round(averages.fiber),
      water: Math.round(averages.water),
      min: kcalRange.min,
      max: kcalRange.max,
      avg: Math.round(averages.kcal),
    },
    ranges,
    min: kcalRange,
    max: kcalRange,
    bestWeek,
    worstWeek,
    tips,
    adherencePct,
    longestStreak: nutritionStreak(entries),
  };
}

/** Días consecutivos con algún registro, terminando hoy o ayer. */
export function nutritionStreak(entries: NutritionEntry[]): number {
  if (!entries.length) return 0;
  const dates = new Set(entries.map((entry) => entry.date));
  const cursor = new Date();
  const today = todayISO(cursor);
  if (!dates.has(today)) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dates.has(todayISO(cursor))) return 0;
  }
  let streak = 0;
  for (;;) {
    const key = todayISO(cursor);
    if (!dates.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
