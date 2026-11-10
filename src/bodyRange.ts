/**
 * Rangos corporales seguros y proyección de progreso.
 *
 * Los rangos no se piden al usuario: se deducen del sexo y la edad de la última
 * medida. Sirven como referencia orientativa, no como diagnóstico. La
 * proyección usa el déficit/superávit calculado con `computeMacros` y el gasto
 * estimado, y se limita a ritmos respaldados por la literatura (≈0,5–1 % del
 * peso por semana al perder grasa y ≈0,25–0,5 % al ganar).
 */
import type { Lang } from './i18n';
import { tx } from './i18n';
import type { ActivityLevel, BodyMeasures, GoalMode, Sex } from './types';
import {
  addDays,
  bmrMifflin,
  bodyComposition,
  clamp,
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
  fatMass: number | null;
  leanMass: number | null;
}

export type ProjectionTargetSource = 'composition' | 'bmi' | 'maintain' | 'none';

export type IntakeSource = 'manual' | 'logged' | 'target';

export interface ProjectionOptions {
  /**
   * Ingesta media real. Si falta o es 0, la proyección usa el objetivo de
   * calorías calculado con `computeMacros`.
   */
  avgIntakeKcal?: number;
  /** Origen del dato para explicarlo en la interfaz. */
  intakeSource?: Exclude<IntakeSource, 'target'>;
}

export interface BodyProjection {
  available: boolean;
  direction: 'lose' | 'gain' | 'maintain';
  targetWeight: number | null;
  targetBodyFat: number | null;
  targetBmi: number | null;
  /** Masa grasa que corresponde al peso objetivo. */
  targetFatMass: number | null;
  /** Masa magra que se espera conservar o ganar hasta el objetivo. */
  targetLeanMass: number | null;
  /** De dónde sale el peso objetivo: composición, IMC o mantenimiento. */
  targetSource: ProjectionTargetSource;
  /** Sesiones de fuerza al mes usadas en el cálculo. */
  strengthPerMonth: number;
  weeklyRateKg: number;
  /** Ritmo al final de la simulación: baja si el peso cambia el gasto. */
  finalWeeklyRateKg: number;
  dailyKcalDelta: number;
  /** Déficit/superávit como porcentaje del gasto (negativo = déficit). */
  deficitPct: number | null;
  /** Ingesta media usada en el balance. */
  avgIntakeKcal: number | null;
  intakeSource: IntakeSource;
  /** El balance se recortó al máximo semanal seguro para el peso. */
  rateCapped: boolean;
  weeks: number | null;
  etaDate: string | null;
  targetReached: boolean;
  safe: boolean;
  message: string;
  /** Explica el objetivo por composición y el efecto de la fuerza. */
  note: string;
  /** Avisos de seguridad del balance, además del rango de IMC. */
  warnings: string[];
  milestones: ProjectionMilestone[];
}

const KCAL_PER_KG_FAT = 7700;
/** ≈3 sesiones de fuerza por semana: estímulo completo para conservar masa magra. */
export const STRENGTH_SESSIONS_PER_MONTH_FULL = 12;

/** 0 sin fuerza registrada, 1 con ≥12 sesiones al mes. */
export function strengthFactor(perMonth: number): number {
  if (!Number.isFinite(perMonth) || perMonth <= 0) return 0;
  return clamp(perMonth / STRENGTH_SESSIONS_PER_MONTH_FULL, 0, 1);
}

/**
 * Duración legible para la proyección. Las proyecciones largas se muestran en
 * meses o años: "130 semanas" no dice nada, "2,5 años" sí.
 */
export function formatProjectionDuration(weeks: number, lang: Lang = 'es'): string {
  const total = Math.max(1, Math.round(weeks));
  if (total >= 52) {
    const rounded = Math.round((total / 52) * 10) / 10;
    const text = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1).replace('.', lang === 'en' ? '.' : ',');
    return tx(lang, `${text} años`, `${text} years`);
  }
  if (total >= 12) {
    const months = Math.max(1, Math.round(total / (52 / 12)));
    return tx(lang, `${months} meses`, `${months} months`);
  }
  return tx(lang, `${total} semana(s)`, `${total} week(s)`);
}

/** IMC saludable. En mayores de 65 se acepta un margen algo mayor (22–27). */
export function safeBmiRange(age: number, lang: Lang = 'es'): SafeRange {
  if (age >= 65) {
    return {
      min: 22,
      max: 27,
      label: tx(lang, 'IMC orientativo 22,0–27,0', 'Reference BMI 22.0–27.0'),
      note: tx(
        lang,
        'En personas mayores, un IMC ligeramente superior se asocia a menor pérdida de masa muscular.',
        'In older people, a slightly higher BMI is associated with less muscle mass loss.',
      ),
    };
  }
  if (age > 0 && age < 18) {
    return {
      min: 18.5,
      max: 24.9,
      label: tx(lang, 'IMC orientativo 18,5–24,9', 'Reference BMI 18.5–24.9'),
      note: tx(
        lang,
        'En menores de edad el IMC debe interpretarse con percentiles pediátricos.',
        'In minors, BMI should be interpreted using pediatric percentiles.',
      ),
    };
  }
  return {
    min: 18.5,
    max: 24.9,
    label: tx(lang, 'IMC saludable 18,5–24,9', 'Healthy BMI 18.5–24.9'),
    note: tx(
      lang,
      'Rango de la OMS para adultos; no distingue grasa de músculo.',
      'WHO range for adults; it does not distinguish fat from muscle.',
    ),
  };
}

/**
 * Porcentaje de grasa orientativo por sexo y edad. Los mínimos son valores
 * esenciales/atletas y los máximos, el límite saludable aproximado.
 */
export function safeBodyFatRange(sex: Sex, age: number, lang: Lang = 'es'): SafeRange | null {
  if (sex === 'unspecified') return null;
  if (sex === 'male') {
    if (age >= 60) {
      return {
        min: 13,
        max: 24,
        label: tx(lang, '% grasa 13–24', 'Body fat 13–24%'),
        note: tx(lang, 'Referencia para hombres de 60 años o más.', 'Reference for men aged 60 and over.'),
      };
    }
    if (age >= 40) {
      return {
        min: 11,
        max: 22,
        label: tx(lang, '% grasa 11–22', 'Body fat 11–22%'),
        note: tx(lang, 'Referencia para hombres de 40–59 años.', 'Reference for men aged 40–59.'),
      };
    }
    return {
      min: 8,
      max: 19,
      label: tx(lang, '% grasa 8–19', 'Body fat 8–19%'),
      note: tx(lang, 'Referencia para hombres de 20–39 años.', 'Reference for men aged 20–39.'),
    };
  }
  if (age >= 60) {
    return {
      min: 24,
      max: 35,
      label: tx(lang, '% grasa 24–35', 'Body fat 24–35%'),
      note: tx(lang, 'Referencia para mujeres de 60 años o más.', 'Reference for women aged 60 and over.'),
    };
  }
  if (age >= 40) {
    return {
      min: 23,
      max: 34,
      label: tx(lang, '% grasa 23–34', 'Body fat 23–34%'),
      note: tx(lang, 'Referencia para mujeres de 40–59 años.', 'Reference for women aged 40–59.'),
    };
  }
  return {
    min: 21,
    max: 32,
    label: tx(lang, '% grasa 21–32', 'Body fat 21–32%'),
    note: tx(lang, 'Referencia para mujeres de 20–39 años.', 'Reference for women aged 20–39.'),
  };
}

export function classifyValue(
  value: number | null,
  range: SafeRange | null,
  lang: Lang = 'es',
): RangeStatus {
  if (value === null || !Number.isFinite(value) || !range) {
    return {
      value,
      status: 'unknown',
      label: tx(lang, 'Sin datos suficientes', 'Not enough data'),
      color: 'muted',
    };
  }
  if (value < range.min) {
    return {
      value,
      status: 'low',
      label: tx(lang, 'Por debajo del rango', 'Below range'),
      color: 'info',
    };
  }
  if (value > range.max) {
    return {
      value,
      status: 'high',
      label: tx(lang, 'Por encima del rango', 'Above range'),
      color: 'warn',
    };
  }
  return {
    value,
    status: 'safe',
    label: tx(lang, 'Dentro del rango', 'Within range'),
    color: 'success',
  };
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

interface WeightSimulation {
  weeks: number;
  initialRateKg: number;
  finalRateKg: number;
  rateCapped: boolean;
  reached: boolean;
  /** Peso al final de cada semana; el índice 0 es el peso actual. */
  weeklyWeights: number[];
}

/**
 * Simula el peso semana a semana. El gasto basal se recalcula con el peso
 * simulado, así que el ritmo inicial no se mantiene constante: al bajar de peso
 * el TDEE baja y el mismo déficit rinde menos. El tope de seguridad depende del
 * peso y del estímulo de fuerza.
 */
function simulateWeight(
  startWeight: number,
  targetWeight: number,
  goal: GoalMode,
  activity: number,
  intakeKcal: number,
  measures: BodyMeasures,
  effect: number,
  maxWeeks = 520,
): WeightSimulation {
  const weeklyWeights = [startWeight];
  const empty: WeightSimulation = {
    weeks: 0,
    initialRateKg: 0,
    finalRateKg: 0,
    rateCapped: false,
    reached: goal === 'maintain',
    weeklyWeights,
  };
  if (
    goal === 'maintain' ||
    !(targetWeight > 0) ||
    Math.abs(targetWeight - startWeight) < 0.05
  ) {
    return empty;
  }

  const direction = goal === 'cut' ? -1 : 1;
  const height = measures.height > 0 ? measures.height : 170;
  const age = measures.age > 0 ? measures.age : 30;
  let weight = startWeight;
  let weeks = 0;
  let initialRate = 0;
  let finalRate = 0;
  let rateCapped = false;
  let reached = false;

  for (; weeks < maxWeeks; weeks += 1) {
    const bmr = bmrMifflin(weight, height, age, measures.sex);
    const tdee = bmr * activity;
    const delta = intakeKcal - tdee;
    // Si el balance ya no empuja hacia el objetivo, la proyección se detiene.
    if (direction < 0 ? delta >= 0 : delta <= 0) break;

    let rate = (Math.abs(delta) * 7) / KCAL_PER_KG_FAT;
    const cap =
      direction < 0
        ? weight * (0.0075 + 0.0025 * effect)
        : weight * (0.0025 + 0.0025 * effect);
    if (rate > cap) {
      rate = cap;
      rateCapped = true;
    }
    if (!Number.isFinite(rate) || rate <= 0) break;

    if (weeks === 0) initialRate = rate;
    finalRate = rate;
    const next = weight + direction * rate;
    weight = direction < 0 ? Math.max(targetWeight, next) : Math.min(targetWeight, next);
    weeklyWeights.push(weight);

    if (
      (direction < 0 && weight <= targetWeight + 1e-6) ||
      (direction > 0 && weight >= targetWeight - 1e-6)
    ) {
      reached = true;
      weeks += 1;
      break;
    }
  }

  return {
    weeks,
    initialRateKg: initialRate,
    finalRateKg: finalRate,
    rateCapped,
    reached,
    weeklyWeights,
  };
}

function interpolateWeight(weeklyWeights: number[], week: number): number {
  if (!weeklyWeights.length) return 0;
  const clamped = clamp(week, 0, weeklyWeights.length - 1);
  const low = Math.floor(clamped);
  const high = Math.min(weeklyWeights.length - 1, low + 1);
  const fraction = clamped - low;
  return weeklyWeights[low] + (weeklyWeights[high] - weeklyWeights[low]) * fraction;
}

function weightProgress(start: number, current: number, target: number): number {
  const total = target - start;
  if (Math.abs(total) < 1e-6) return 1;
  return clamp((current - start) / total, 0, 1);
}

/**
 * Proyecta el progreso hacia el objetivo. Si faltan datos devuelve
 * `available: false` con un mensaje explicativo en vez de inventar cifras.
 *
 * Cuando hay composición corporal, el peso objetivo se recalcula desde la masa
 * magra y la masa grasa, no solo desde el IMC. Las sesiones de fuerza al mes
 * ajustan cuánta masa magra se conserva (definición) o se gana (volumen) y el
 * ritmo seguro de cambio de peso.
 */
export function projectBody(
  measures: BodyMeasures,
  goal: GoalMode,
  weeklyMinutes: number,
  activityLevel?: ActivityLevel,
  comp?: BodyComposition,
  lang: Lang = 'es',
  strengthPerMonth = 0,
  avgSteps = 0,
  options: ProjectionOptions = {},
): BodyProjection {
  const composition = comp ?? bodyComposition(measures, lang);
  const bmi = composition.bmi;
  const bmiRange = safeBmiRange(measures.age, lang);
  const fatRange = safeBodyFatRange(measures.sex, measures.age, lang);
  const macros = computeMacros(measures, weeklyMinutes, goal, activityLevel, lang, avgSteps);
  const strength = Number.isFinite(strengthPerMonth) ? Math.max(0, strengthPerMonth) : 0;
  const effect = strengthFactor(strength);
  const empty: BodyProjection = {
    available: false,
    direction: goal === 'cut' ? 'lose' : goal === 'bulk' ? 'gain' : 'maintain',
    targetWeight: null,
    targetBodyFat: null,
    targetBmi: null,
    targetFatMass: null,
    targetLeanMass: null,
    targetSource: 'none',
    strengthPerMonth: Math.round(strength * 10) / 10,
    weeklyRateKg: 0,
    finalWeeklyRateKg: 0,
    dailyKcalDelta: 0,
    deficitPct: null,
    avgIntakeKcal: null,
    intakeSource: 'target',
    rateCapped: false,
    weeks: null,
    etaDate: null,
    targetReached: false,
    safe: true,
    message: tx(
      lang,
      'Añade peso, altura y, si puedes, cintura para calcular una proyección.',
      'Add weight, height and, if possible, waist to calculate a projection.',
    ),
    note: '',
    warnings: [],
    milestones: [],
  };
  if (!macros || !measures.weight || measures.weight <= 0) return empty;

  const currentBmi = bmi ?? null;
  const currentFat = composition.avg;
  const currentFatMass = composition.fatMass;
  const leanMass = composition.leanMass;
  const baseTargetFat = targetBodyFat(goal, measures.sex, fatRange);
  const declaredIntake = Number(options.avgIntakeKcal);
  const hasIntake = Number.isFinite(declaredIntake) && declaredIntake > 0;
  const intakeKcal = hasIntake ? declaredIntake : macros.kcal;
  const intakeSource: IntakeSource = hasIntake ? (options.intakeSource ?? 'manual') : 'target';
  const delta = intakeKcal - macros.tdee;
  const deficitPct = macros.tdee > 0 ? (delta / macros.tdee) * 100 : null;
  const maxBmi = bmiRange.max;
  const minBmi = bmiRange.min;

  let targetWeight: number | null = null;
  let targetFat: number | null = null;
  let targetFatMass: number | null = null;
  let targetLeanMass: number | null = null;
  let targetSource: ProjectionTargetSource = 'none';

  if (goal === 'maintain') {
    targetWeight = measures.weight;
    targetFat = currentFat;
    targetFatMass = currentFatMass;
    targetLeanMass = leanMass;
    targetSource = 'maintain';
  } else if (leanMass !== null && currentFatMass !== null && baseTargetFat !== null) {
    // Objetivo por composición: se fija la masa magra que se espera conservar
    // o ganar y se calcula la grasa necesaria para llegar al % objetivo.
    targetSource = 'composition';
    if (goal === 'cut') {
      // Sin fuerza se asume una pérdida moderada de masa magra; con ≥12
      // sesiones al mes se asume retención completa.
      targetFat = currentFat !== null ? Math.min(baseTargetFat, currentFat) : baseTargetFat;
      targetLeanMass = leanMass * (0.95 + 0.05 * effect);
    } else {
      // En volumen no se fuerza una definición encubierta: si ya se está por
      // encima del objetivo, se mantiene la grasa actual.
      const upperFat = fatRange ? fatRange.max : baseTargetFat;
      targetFat = currentFat !== null
        ? Math.max(baseTargetFat, Math.min(upperFat, currentFat))
        : baseTargetFat;
      // Hasta ~1,5 % más de masa magra con fuerza frecuente; sin fuerza, el
      // superávit se reparte peor y no se proyecta ganancia magra extra.
      targetLeanMass = leanMass * (1 + 0.015 * effect);
    }
    targetFat = Math.min(99, Math.max(1, targetFat));
    targetFatMass = targetLeanMass * (targetFat / (100 - targetFat));
    targetWeight = targetLeanMass + targetFatMass;
  } else if (currentBmi !== null && measures.height > 0) {
    // Sin composición solo queda el IMC; se limita al rango orientativo.
    targetSource = 'bmi';
    const fallbackBmi =
      goal === 'cut'
        ? Math.max(minBmi, Math.min(maxBmi, currentBmi - 1.5))
        : Math.min(maxBmi, currentBmi + 1);
    targetWeight = fallbackBmi * (measures.height / 100) ** 2;
    targetFat = baseTargetFat;
    targetFatMass = baseTargetFat !== null ? (targetWeight * baseTargetFat) / 100 : null;
    targetLeanMass = targetFatMass !== null ? targetWeight - targetFatMass : null;
  }

  // El objetivo debe ir en la dirección del modo elegido: una proyección de
  // déficit no puede terminar pesando más que hoy (y viceversa). Si la
  // composición ya no admite más cambio, se mantiene la composición actual.
  if (targetWeight !== null) {
    const previousWeight = targetWeight;
    targetWeight =
      goal === 'cut'
        ? Math.min(targetWeight, measures.weight)
        : goal === 'bulk'
          ? Math.max(targetWeight, measures.weight)
          : measures.weight;
    if (Math.abs(targetWeight - previousWeight) > 0.01) {
      targetFat = currentFat;
      targetFatMass = currentFatMass;
      targetLeanMass = leanMass;
    }
  }

  // El IMC queda como referencia, no como límite del objetivo por composición:
  // una persona con mucha masa muscular puede tener un IMC alto y poca grasa.
  const targetBmi =
    targetWeight !== null && measures.height > 0
      ? targetWeight / (measures.height / 100) ** 2
      : null;

  // Simulación semanal: el TDEE se recalcula con el peso y el tope de seguridad
  // depende del peso y del estímulo de fuerza. Así un déficit de 500 kcal no
  // rinde lo mismo en alguien de 60 kg que en alguien de 110 kg, y el ritmo
  // inicial no se mantiene artificialmente constante al bajar de peso.
  const simulation = simulateWeight(
    measures.weight,
    targetWeight ?? measures.weight,
    goal,
    macros.activity,
    intakeKcal,
    measures,
    effect,
  );
  const weeklyRateKg = simulation.initialRateKg;
  const weeks = simulation.weeks;

  const safe =
    (goal !== 'cut' || currentBmi === null || currentBmi > minBmi) &&
    (goal !== 'bulk' || currentBmi === null || currentBmi < maxBmi);

  const warnings: string[] = [];
  if (hasIntake && intakeKcal < macros.bmr) {
    warnings.push(
      tx(
        lang,
        `Tu ingesta media (${Math.round(intakeKcal)} kcal) está por debajo de tu gasto basal (${macros.bmr} kcal). Un déficit así no es sostenible ni seguro: sube la ingesta o consulta con un profesional.`,
        `Your average intake (${Math.round(intakeKcal)} kcal) is below your basal expenditure (${macros.bmr} kcal). A deficit like this is not sustainable or safe: increase intake or consult a professional.`,
      ),
    );
  }
  if (goal === 'cut' && deficitPct !== null && deficitPct <= -30) {
    warnings.push(
      tx(
        lang,
        `El déficit equivale al ${Math.abs(Math.round(deficitPct))} % de tu gasto. Por encima del 25–30 % suele ser difícil mantener la masa magra y la adherencia; plantea un déficit más moderado.`,
        `The deficit is ${Math.abs(Math.round(deficitPct))}% of your expenditure. Above 25–30% it is usually hard to preserve lean mass and adherence; consider a more moderate deficit.`,
      ),
    );
  }
  if (goal === 'bulk' && deficitPct !== null && deficitPct >= 20) {
    warnings.push(
      tx(
        lang,
        `El superávit equivale al ${Math.round(deficitPct)} % de tu gasto. Un superávit tan alto suele acumular grasa más rápido de lo que se gana músculo; prueba con un excedente menor.`,
        `The surplus is ${Math.round(deficitPct)}% of your expenditure. Such a high surplus usually adds fat faster than muscle; try a smaller surplus.`,
      ),
    );
  }
  if (simulation.rateCapped && simulation.initialRateKg > 0) {
    warnings.push(
      tx(
        lang,
        `El balance planteado supera el ritmo seguro para tu peso; la proyección se limita a ${simulation.initialRateKg.toFixed(2)} kg/semana (${((simulation.initialRateKg / measures.weight) * 100).toFixed(2)} % del peso).`,
        `The planned balance exceeds the safe rate for your weight; the projection is capped at ${simulation.initialRateKg.toFixed(2)} kg/week (${((simulation.initialRateKg / measures.weight) * 100).toFixed(2)}% of body weight).`,
      ),
    );
  }

  // Hitos: 4 pasos sobre la curva simulada. La composición se interpola con el
  // progreso real de peso, no con una recta temporal, y el peso del hito sale
  // de la simulación para que sea coherente con la fecha.
  const milestones: ProjectionMilestone[] = [];
  if (targetWeight !== null && weeks > 0) {
    const steps = 4;
    for (let index = 1; index <= steps; index += 1) {
      const fraction = index / steps;
      const projectedWeek = weeks * fraction;
      const simulatedWeight = interpolateWeight(simulation.weeklyWeights, projectedWeek);
      const progress = weightProgress(measures.weight, simulatedWeight, targetWeight);
      let weight = simulatedWeight;
      let projectedFat: number | null = null;
      let projectedFatMass: number | null = null;
      let projectedLeanMass: number | null = null;

      if (leanMass !== null && targetLeanMass !== null) {
        projectedLeanMass = leanMass + (targetLeanMass - leanMass) * progress;
        projectedFatMass = Math.max(0, weight - projectedLeanMass);
        projectedFat = weight > 0 ? (projectedFatMass / weight) * 100 : null;
      } else if (leanMass !== null && weight > 0) {
        projectedFat = ((weight - leanMass) / weight) * 100;
        projectedFatMass = weight - leanMass;
        projectedLeanMass = leanMass;
      }

      milestones.push({
        date: shiftDate(projectedWeek * 7),
        weight,
        bodyFat:
          projectedFat !== null && Number.isFinite(projectedFat) ? projectedFat : null,
        fatMass:
          projectedFatMass !== null && Number.isFinite(projectedFatMass)
            ? projectedFatMass
            : null,
        leanMass:
          projectedLeanMass !== null && Number.isFinite(projectedLeanMass)
            ? projectedLeanMass
            : null,
      });
    }
  }

  const strengthText =
    strength > 0
      ? tx(
          lang,
          `${Math.round(strength)} sesión(es) de fuerza al mes`,
          `${Math.round(strength)} strength session(s) per month`,
        )
      : tx(
          lang,
          'sin sesiones de fuerza registradas en los últimos 30 días',
          'no strength sessions logged in the last 30 days',
        );
  const stepsText =
    avgSteps > 0
      ? tx(
          lang,
          ` y ${Math.round(avgSteps)} pasos/día de media`,
          ` and an average of ${Math.round(avgSteps)} steps/day`,
        )
      : '';
  const intakeText =
    intakeSource === 'manual'
      ? tx(
          lang,
          `Ingesta media indicada: ${Math.round(intakeKcal)} kcal/día.`,
          `Declared average intake: ${Math.round(intakeKcal)} kcal/day.`,
        )
      : intakeSource === 'logged'
        ? tx(
            lang,
            `Ingesta media de tus registros recientes: ${Math.round(intakeKcal)} kcal/día.`,
            `Average intake from your recent logs: ${Math.round(intakeKcal)} kcal/day.`,
          )
        : tx(
            lang,
            `Se usa el objetivo de ${Math.round(intakeKcal)} kcal/día como ingesta; si sueles comer distinto, indica tu media.`,
            `Your target of ${Math.round(intakeKcal)} kcal/day is used as intake; if you usually eat differently, enter your average.`,
          );
  const paceText =
    weeks > 1 && simulation.finalRateKg > 0 && simulation.finalRateKg < weeklyRateKg * 0.95
      ? tx(
          lang,
          ` El ritmo baja a ${simulation.finalRateKg.toFixed(2)} kg/semana al final porque el gasto disminuye con el peso.`,
          ` The pace drops to ${simulation.finalRateKg.toFixed(2)} kg/week by the end because expenditure falls with weight.`,
        )
      : '';

  let note = '';
  if (targetSource === 'composition' && targetLeanMass !== null && targetFatMass !== null) {
    note = tx(
      lang,
      `Peso objetivo recalculado con tu composición: ${targetLeanMass.toFixed(1)} kg de masa magra y ${targetFatMass.toFixed(1)} kg de masa grasa (${targetFat?.toFixed(0) ?? '—'}% grasa). ${Math.round(weeklyMinutes)} min/semana, ${strengthText}${stepsText}; ${
        goal === 'bulk'
          ? 'se proyecta una ganancia magra moderada'
          : effect > 0
            ? 'se asume retención de masa magra'
            : 'se asume cierta pérdida de masa magra'
      }. ${intakeText}${paceText}`,
      `Target weight recalculated from your composition: ${targetLeanMass.toFixed(1)} kg lean mass and ${targetFatMass.toFixed(1)} kg fat mass (${targetFat?.toFixed(0) ?? '—'}% fat). ${Math.round(weeklyMinutes)} min/week, ${strengthText}${stepsText}; ${
        goal === 'bulk'
          ? 'a moderate lean gain is projected'
          : effect > 0
            ? 'lean mass is assumed to be preserved'
            : 'some lean mass loss is assumed'
      }. ${intakeText}${paceText}`,
    );
    if (targetBmi !== null && (targetBmi < minBmi || targetBmi > maxBmi)) {
      note += ' ' + tx(
        lang,
        `El IMC objetivo (${targetBmi.toFixed(1)}) queda fuera del rango orientativo: en personas con más masa muscular el IMC pierde precisión, así que prioriza la composición corporal.`,
        `The target BMI (${targetBmi.toFixed(1)}) is outside the reference range: BMI is less accurate in people with more muscle mass, so prioritize body composition.`,
      );
    }
  } else if (targetSource === 'bmi') {
    note = tx(
      lang,
      `Faltan medidas de composición: el peso objetivo se estima solo con el IMC y puede ser menos preciso. Añade cuello, cintura o abdomen para recalcularlo con masa magra y grasa. ${intakeText}${paceText}`,
      `Composition measurements are missing: target weight is estimated from BMI alone and may be less accurate. Add neck, waist or abdomen measurements to recalculate it from lean and fat mass. ${intakeText}${paceText}`,
    );
  } else {
    note = `${intakeText}${paceText}`;
  }

  const percentageText =
    deficitPct !== null && Math.abs(deficitPct) >= 1
      ? tx(
          lang,
          ` (${Math.abs(Math.round(deficitPct))} % de tu gasto)`,
          ` (${Math.abs(Math.round(deficitPct))}% of your expenditure)`,
        )
      : '';
  const cappedText = simulation.rateCapped
    ? tx(
        lang,
        ' El ritmo está limitado al máximo seguro para tu peso.',
        ' The pace is capped at the safe maximum for your weight.',
      )
    : '';

  let message: string;
  if (!safe) {
    message =
      goal === 'cut'
        ? tx(
            lang,
            `No se proyecta más pérdida de peso: tu IMC (${currentBmi?.toFixed(1) ?? '—'}) ya está en el límite bajo. Mantén el peso y prioriza fuerza y proteína; consulta con un profesional antes de seguir bajando.`,
            `No further weight loss is projected: your BMI (${currentBmi?.toFixed(1) ?? '—'}) is already at the lower limit. Maintain your weight and prioritize strength and protein; consult a professional before going lower.`,
          )
        : tx(
            lang,
            `No se proyecta más ganancia: tu IMC (${currentBmi?.toFixed(1) ?? '—'}) ya está en el límite alto. Mantén el peso o busca una ganancia muy lenta con supervisión.`,
            `No further gain is projected: your BMI (${currentBmi?.toFixed(1) ?? '—'}) is already at the upper limit. Maintain your weight or aim for a very slow gain under supervision.`,
          );
  } else if (goal === 'maintain') {
    message = hasIntake
      ? tx(
          lang,
          `Con una ingesta media de ${Math.round(intakeKcal)} kcal y un gasto de ${Math.round(macros.tdee)} kcal, tu balance es ${delta > 0 ? '+' : ''}${Math.round(delta)} kcal/día. Para mantener el peso, ajusta la ingesta a unas ${Math.round(macros.tdee)} kcal/día.`,
          `With an average intake of ${Math.round(intakeKcal)} kcal and an expenditure of ${Math.round(macros.tdee)} kcal, your balance is ${delta > 0 ? '+' : ''}${Math.round(delta)} kcal/day. To maintain your weight, adjust intake to about ${Math.round(macros.tdee)} kcal/day.`,
        )
      : tx(
          lang,
          `Con ${Math.round(macros.kcal)} kcal/día mantienes el peso actual. Tu TDEE estimado es ${Math.round(macros.tdee)} kcal.`,
          `With ${Math.round(macros.kcal)} kcal/day you maintain your current weight. Your estimated TDEE is ${Math.round(macros.tdee)} kcal.`,
        );
  } else if (weeks === 0) {
    if (targetWeight === null) {
      message = tx(
        lang,
        'No hay datos suficientes para fijar un peso objetivo seguro.',
        'There is not enough data to set a safe target weight.',
      );
    } else if (Math.abs(targetWeight - measures.weight) < 0.2) {
      message = tx(
        lang,
        'Ya estás en el rango objetivo: mantén el rumbo y prioriza la adherencia.',
        'You are already in the target range: stay the course and prioritize adherence.',
      );
    } else if (goal === 'cut') {
      message = tx(
        lang,
        `Con tu ingesta media de ${Math.round(intakeKcal)} kcal y un gasto de ${Math.round(macros.tdee)} kcal no hay déficit: la proyección no avanza. Reduce la ingesta o aumenta la actividad; con el objetivo de ${Math.round(macros.kcal)} kcal sí habría déficit.`,
        `With your average intake of ${Math.round(intakeKcal)} kcal and an expenditure of ${Math.round(macros.tdee)} kcal there is no deficit: the projection does not progress. Reduce intake or increase activity; with the target of ${Math.round(macros.kcal)} kcal there would be a deficit.`,
      );
    } else {
      message = tx(
        lang,
        `Con tu ingesta media de ${Math.round(intakeKcal)} kcal y un gasto de ${Math.round(macros.tdee)} kcal no hay superávit: la proyección no avanza. Aumenta la ingesta o reduce la actividad; con el objetivo de ${Math.round(macros.kcal)} kcal sí habría superávit.`,
        `With your average intake of ${Math.round(intakeKcal)} kcal and an expenditure of ${Math.round(macros.tdee)} kcal there is no surplus: the projection does not progress. Increase intake or reduce activity; with the target of ${Math.round(macros.kcal)} kcal there would be a surplus.`,
      );
    }
  } else {
    const rateText =
      lang === 'en' ? weeklyRateKg.toFixed(2) : weeklyRateKg.toFixed(2).replace('.', ',');
    const arrivalText = simulation.reached
      ? tx(
          lang,
          `Objetivo: ${targetWeight!.toFixed(1)} kg en ~${formatProjectionDuration(weeks, lang)}, siempre que la actividad y la ingesta se mantengan.`,
          `Target: ${targetWeight!.toFixed(1)} kg in ~${formatProjectionDuration(weeks, lang)}, as long as activity and intake stay the same.`,
        )
      : tx(
          lang,
          `El objetivo de ${targetWeight!.toFixed(1)} kg no se alcanza en el horizonte simulado con este balance; revisa la ingesta o la actividad.`,
          `The ${targetWeight!.toFixed(1)} kg target is not reached within the simulated horizon at this balance; review intake or activity.`,
        );
    message = tx(
      lang,
      `${goal === 'cut' ? 'Déficit' : 'Superávit'} de ${Math.abs(Math.round(delta))} kcal/día${percentageText} ≈ ${rateText} kg/semana. ${arrivalText}${cappedText}`,
      `${goal === 'cut' ? 'Deficit' : 'Surplus'} of ${Math.abs(Math.round(delta))} kcal/day${percentageText} ≈ ${rateText} kg/week. ${arrivalText}${cappedText}`,
    );
  }

  return {
    available: true,
    direction: goal === 'cut' ? 'lose' : goal === 'bulk' ? 'gain' : 'maintain',
    targetWeight,
    targetBodyFat: targetFat,
    targetBmi,
    targetFatMass,
    targetLeanMass,
    targetSource,
    strengthPerMonth: Math.round(strength * 10) / 10,
    weeklyRateKg,
    finalWeeklyRateKg: simulation.finalRateKg,
    dailyKcalDelta: Math.round(delta),
    deficitPct: deficitPct !== null && Number.isFinite(deficitPct) ? deficitPct : null,
    avgIntakeKcal: hasIntake ? Math.round(intakeKcal) : null,
    intakeSource,
    rateCapped: simulation.rateCapped,
    weeks: weeks > 0 ? Math.round(weeks * 10) / 10 : 0,
    etaDate: weeks > 0 && simulation.reached ? shiftDate(weeks * 7) : null,
    targetReached: simulation.reached,
    safe,
    message,
    note,
    warnings,
    milestones,
  };
}
