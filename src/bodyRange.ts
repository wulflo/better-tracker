/**
 * Rangos corporales seguros y proyección de progreso.
 *
 * Los rangos no se piden al usuario: se deducen del sexo y la edad de la última
 * medida. Sirven como referencia orientativa, no como diagnóstico. La
 * proyección usa el déficit/superávit calculado con `computeMacros` y el gasto
 * estimado, y se limita a ritmos respaldados por la literatura (≈0,5–1 % del
 * peso por semana al perder grasa y ≈0,25–0,5 % al ganar).
 */
import type { ActivityLevel, BodyMeasures, GoalMode, Sex } from './types';
import {
  addDays,
  bodyComposition,
  computeMacros,
  todayISO,
  type BodyComposition,
} from './metrics';

export interface SafeRange {
  min: number;
  max: number;
  label: string;
  note: string;
}

export interface RangeStatus {
  value: number | null;
  status: 'low' | 'safe' | 'high' | 'unknown';
  label: string;
  color: 'info' | 'success' | 'warn' | 'error' | 'muted';
}

export interface ProjectionMilestone {
  date: string;
  weight: number;
  bodyFat: number | null;
}

export interface BodyProjection {
  available: boolean;
  direction: 'lose' | 'gain' | 'maintain';
  targetWeight: number | null;
  targetBodyFat: number | null;
  targetBmi: number | null;
  weeklyRateKg: number;
  dailyKcalDelta: number;
  weeks: number | null;
  etaDate: string | null;
  safe: boolean;
  message: string;
  milestones: ProjectionMilestone[];
}

const KCAL_PER_KG_FAT = 7700;

/** IMC saludable. En mayores de 65 se acepta un margen algo mayor (22–27). */
export function safeBmiRange(age: number): SafeRange {
  if (age >= 65) {
    return {
      min: 22,
      max: 27,
      label: 'IMC orientativo 22,0–27,0',
      note: 'En personas mayores, un IMC ligeramente superior se asocia a menor pérdida de masa muscular.',
    };
  }
  if (age > 0 && age < 18) {
    return {
      min: 18.5,
      max: 24.9,
      label: 'IMC orientativo 18,5–24,9',
      note: 'En menores de edad el IMC debe interpretarse con percentiles pediátricos.',
    };
  }
  return {
    min: 18.5,
    max: 24.9,
    label: 'IMC saludable 18,5–24,9',
    note: 'Rango de la OMS para adultos; no distingue grasa de músculo.',
  };
}

/**
 * Porcentaje de grasa orientativo por sexo y edad. Los mínimos son valores
 * esenciales/atletas y los máximos, el límite saludable aproximado.
 */
export function safeBodyFatRange(sex: Sex, age: number): SafeRange | null {
  if (sex === 'unspecified') return null;
  if (sex === 'male') {
    if (age >= 60) {
      return { min: 13, max: 24, label: '% grasa 13–24', note: 'Referencia para hombres de 60 años o más.' };
    }
    if (age >= 40) {
      return { min: 11, max: 22, label: '% grasa 11–22', note: 'Referencia para hombres de 40–59 años.' };
    }
    return { min: 8, max: 19, label: '% grasa 8–19', note: 'Referencia para hombres de 20–39 años.' };
  }
  if (age >= 60) {
    return { min: 24, max: 35, label: '% grasa 24–35', note: 'Referencia para mujeres de 60 años o más.' };
  }
  if (age >= 40) {
    return { min: 23, max: 34, label: '% grasa 23–34', note: 'Referencia para mujeres de 40–59 años.' };
  }
  return { min: 21, max: 32, label: '% grasa 21–32', note: 'Referencia para mujeres de 20–39 años.' };
}

export function classifyValue(value: number | null, range: SafeRange | null): RangeStatus {
  if (value === null || !Number.isFinite(value) || !range) {
    return { value, status: 'unknown', label: 'Sin datos suficientes', color: 'muted' };
  }
  if (value < range.min) {
    return { value, status: 'low', label: 'Por debajo del rango', color: 'info' };
  }
  if (value > range.max) {
    return { value, status: 'high', label: 'Por encima del rango', color: 'warn' };
  }
  return { value, status: 'safe', label: 'Dentro del rango', color: 'success' };
}

function targetBodyFat(goal: GoalMode, sex: Sex, range: SafeRange | null): number | null {
  if (!range) return null;
  if (goal === 'cut') {
    // Zona media-baja del rango saludable, sin llegar a valores de competición.
    return sex === 'male' ? Math.max(range.min + 2, 12) : Math.max(range.min + 3, 22);
  }
  if (goal === 'bulk') {
    // Zona media-alta: margen para ganar músculo sin acumular grasa en exceso.
    return sex === 'male' ? Math.min(range.max - 1, 18) : Math.min(range.max - 1, 28);
  }
  return range.min + (range.max - range.min) / 2;
}

function shiftDate(days: number): string {
  return todayISO(addDays(new Date(), Math.max(0, Math.round(days))));
}

/**
 * Proyecta el progreso hacia el objetivo. Si faltan datos devuelve
 * `available: false` con un mensaje explicativo en vez de inventar cifras.
 */
export function projectBody(
  measures: BodyMeasures,
  goal: GoalMode,
  weeklyMinutes: number,
  activityLevel?: ActivityLevel,
  comp?: BodyComposition,
): BodyProjection {
  const composition = comp ?? bodyComposition(measures);
  const bmi = composition.bmi;
  const bmiRange = safeBmiRange(measures.age);
  const fatRange = safeBodyFatRange(measures.sex, measures.age);
  const macros = computeMacros(measures, weeklyMinutes, goal, activityLevel);
  const empty: BodyProjection = {
    available: false,
    direction: goal === 'cut' ? 'lose' : goal === 'bulk' ? 'gain' : 'maintain',
    targetWeight: null,
    targetBodyFat: null,
    targetBmi: null,
    weeklyRateKg: 0,
    dailyKcalDelta: 0,
    weeks: null,
    etaDate: null,
    safe: true,
    message: 'Añade peso, altura y, si puedes, cintura para calcular una proyección.',
    milestones: [],
  };
  if (!macros || !measures.weight || measures.weight <= 0) return empty;

  const currentBmi = bmi ?? null;
  const currentFat = composition.avg;
  const leanMass = composition.leanMass;
  const targetFat = targetBodyFat(goal, measures.sex, fatRange);
  const delta = macros.kcal - macros.tdee;
  const maxBmi = bmiRange.max;
  const minBmi = bmiRange.min;

  let targetWeight: number | null = null;
  if (goal === 'maintain') {
    targetWeight = measures.weight;
  } else if (leanMass !== null && targetFat !== null) {
    targetWeight = leanMass / (1 - targetFat / 100);
  } else if (currentBmi !== null && measures.height > 0) {
    const targetBmi = goal === 'cut' ? Math.max(minBmi, Math.min(maxBmi, currentBmi - 1.5)) : Math.min(maxBmi, currentBmi + 1);
    targetWeight = targetBmi * (measures.height / 100) ** 2;
  }

  // Nunca proyectamos fuera del rango saludable de IMC.
  if (targetWeight !== null && measures.height > 0) {
    const targetBmi = targetWeight / (measures.height / 100) ** 2;
    const clampedBmi = Math.max(minBmi, Math.min(maxBmi, targetBmi));
    if (Math.abs(clampedBmi - targetBmi) > 0.01) {
      targetWeight = clampedBmi * (measures.height / 100) ** 2;
    }
  }

  // El objetivo debe ir en la dirección del modo elegido: una proyección de
  // déficit no puede terminar pesando más que hoy (y viceversa).
  if (targetWeight !== null) {
    targetWeight =
      goal === 'cut'
        ? Math.min(targetWeight, measures.weight)
        : goal === 'bulk'
          ? Math.max(targetWeight, measures.weight)
          : measures.weight;
  }

  // Ritmo semanal a partir del balance energético, con topes de seguridad.
  const rawWeekly = (Math.abs(delta) * 7) / KCAL_PER_KG_FAT;
  const maxCut = measures.weight * 0.01;
  const maxBulk = measures.weight * 0.005;
  const weeklyRateKg =
    goal === 'maintain' || !Number.isFinite(rawWeekly)
      ? 0
      : goal === 'cut'
        ? Math.min(rawWeekly, maxCut)
        : Math.min(rawWeekly, maxBulk);

  const difference = targetWeight !== null ? targetWeight - measures.weight : 0;
  const weeks =
    goal === 'maintain' || weeklyRateKg <= 0 || Math.abs(difference) < 0.2
      ? 0
      : Math.abs(difference) / weeklyRateKg;

  const safe =
    (goal !== 'cut' || currentBmi === null || currentBmi > minBmi) &&
    (goal !== 'bulk' || currentBmi === null || currentBmi < maxBmi);

  // Hitos aproximados: 4 pasos hacia el objetivo, sin superar 12 meses.
  const milestones: ProjectionMilestone[] = [];
  if (targetWeight !== null && weeks > 0) {
    const steps = 4;
    for (let index = 1; index <= steps; index += 1) {
      const fraction = index / steps;
      const weight = measures.weight + difference * fraction;
      const projectedFat =
        leanMass !== null && weight > 0 ? ((weight - leanMass) / weight) * 100 : null;
      milestones.push({
        date: shiftDate(weeks * 7 * fraction),
        weight,
        bodyFat: projectedFat !== null && Number.isFinite(projectedFat) ? projectedFat : null,
      });
    }
  }

  let message: string;
  if (!safe) {
    message =
      goal === 'cut'
        ? `No se proyecta más pérdida de peso: tu IMC (${currentBmi?.toFixed(1) ?? '—'}) ya está en el límite bajo. Mantén el peso y prioriza fuerza y proteína; consulta con un profesional antes de seguir bajando.`
        : `No se proyecta más ganancia: tu IMC (${currentBmi?.toFixed(1) ?? '—'}) ya está en el límite alto. Mantén el peso o busca una ganancia muy lenta con supervisión.`;
  } else if (goal === 'maintain') {
    message = `Con ${Math.round(macros.kcal)} kcal/día mantienes el peso actual. Tu TDEE estimado es ${Math.round(macros.tdee)} kcal.`;
  } else if (weeks === 0) {
    message =
      targetWeight === null
        ? 'No hay datos suficientes para fijar un peso objetivo seguro.'
        : 'Ya estás en el rango objetivo: mantén el rumbo y prioriza la adherencia.';
  } else {
    const rate = weeklyRateKg.toFixed(2).replace('.', ',');
    message = `${goal === 'cut' ? 'Déficit' : 'Superávit'} de ${Math.abs(Math.round(delta))} kcal/día ≈ ${rate} kg/semana. Objetivo: ${targetWeight!.toFixed(1)} kg en ~${Math.max(1, Math.round(weeks))} semana(s), siempre que la actividad se mantenga.`;
  }

  return {
    available: true,
    direction: goal === 'cut' ? 'lose' : goal === 'bulk' ? 'gain' : 'maintain',
    targetWeight,
    targetBodyFat: goal === 'maintain' ? currentFat : targetFat,
    targetBmi: targetWeight !== null && measures.height > 0 ? targetWeight / (measures.height / 100) ** 2 : null,
    weeklyRateKg,
    dailyKcalDelta: Math.round(delta),
    weeks: weeks > 0 ? Math.round(weeks * 10) / 10 : 0,
    etaDate: weeks > 0 ? shiftDate(weeks * 7) : null,
    safe,
    message,
    milestones,
  };
}
