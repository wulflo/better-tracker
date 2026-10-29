import type {
  ActivityLevel,
  BodyMeasures,
  Exercise,
  GoalMode,
  MeasurementEntry,
  NutritionEntry,
  PR,
  Reminder,
  Routine,
  Session,
  VaultEvent,
  WeightEntry,
  Workout,
  Mesocycle,
  Plan,
} from './types';
import { EMPTY_MEASURES } from './types';
import { ZONES, ZONE_MAP, type ZoneId, zoneForExercise } from './zones';

export const DAY_MS = 86_400_000;

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY_MS);
}

export function formatShort(date: string): string {
  const d = parseISO(date);
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}

export function formatLong(date: string): string {
  const d = parseISO(date);
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function monthLabel(d: Date): string {
  const label = d.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setDate(copy.getDate() - day);
  return copy;
}

export function weekKey(date: string): string {
  return todayISO(startOfWeek(parseISO(date)));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function round(v: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export function safeNum(v: string): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function goalModeFromEvents(events: VaultEvent[]): GoalMode {
  const last = [...events].reverse().find((e) => e.kind === 'goal.mode');
  const mode = last?.payload?.mode;
  return mode === 'cut' || mode === 'bulk' || mode === 'maintain' ? mode : 'maintain';
}

export interface ActivityOption {
  id: ActivityLevel;
  label: string;
  short: string;
  multiplier: number;
  description: string;
}

/**
 * Niveles de actividad declarados por el usuario. Los multiplicadores son PAL
 * estándar e incluyen tanto la vida diaria como el entrenamiento habitual; por
 * eso no se suman otra vez los minutos registrados.
 */
export const ACTIVITY_LEVELS: ActivityOption[] = [
  {
    id: 'sedentary',
    label: 'Sedentario',
    short: 'Sedentario',
    multiplier: 1.2,
    description: 'Trabajo de oficina, poco movimiento y sin entrenamiento habitual.',
  },
  {
    id: 'light',
    label: 'Ligero',
    short: 'Ligero',
    multiplier: 1.375,
    description: 'Camina a diario, trabaja de pie o entrena 1-2 veces por semana.',
  },
  {
    id: 'moderate',
    label: 'Moderado',
    short: 'Moderado',
    multiplier: 1.55,
    description: 'Actividad diaria normal y 3-4 entrenamientos por semana.',
  },
  {
    id: 'high',
    label: 'Alto',
    short: 'Alto',
    multiplier: 1.725,
    description: 'Trabajo físico o 5-6 entrenamientos intensos por semana.',
  },
  {
    id: 'very_high',
    label: 'Muy alto',
    short: 'Muy alto',
    multiplier: 1.9,
    description: 'Trabajo muy físico, dobles sesiones o deporte de competición.',
  },
];

/**
 * Opción por defecto: deduce el multiplicador de los minutos de entrenamiento
 * registrados, como hacía la app antes de existir el selector. Así nadie ve un
 * objetivo inflado solo por no haber tocado todavía el nivel de actividad.
 */
export const AUTO_ACTIVITY: ActivityOption = {
  id: 'auto',
  label: 'Automático',
  short: 'Auto',
  multiplier: 0,
  description: 'Se calcula con los minutos de entrenamiento de los últimos 7 días. Elige un nivel si prefieres fijarlo.',
};

export function activityLevelFromEvents(events: VaultEvent[]): ActivityLevel {
  const last = [...events].reverse().find((e) => e.kind === 'activity.level');
  const level = last?.payload?.level;
  if (level === 'auto') return 'auto';
  return ACTIVITY_LEVELS.some((option) => option.id === level) ? (level as ActivityLevel) : 'auto';
}

export function activityOption(level: ActivityLevel): ActivityOption {
  if (level === 'auto') return AUTO_ACTIVITY;
  return ACTIVITY_LEVELS.find((option) => option.id === level) ?? AUTO_ACTIVITY;
}

export function historyCutoff(events: VaultEvent[]): string {
  const last = [...events].reverse().find((e) => e.kind === 'history.cleared');
  return typeof last?.payload?.at === 'string' ? last.payload.at : '';
}

const TRAINING_KINDS = new Set(['session.saved', 'workout.saved', 'pr.achieved']);

export function visibleTrainingEvents(events: VaultEvent[]): VaultEvent[] {
  const cutoff = historyCutoff(events);
  return events.filter(
    (e) => !TRAINING_KINDS.has(e.kind) || !cutoff || e.timestamp > cutoff,
  );
}

export function reduceExercises(events: VaultEvent[]): Exercise[] {
  const map = new Map<string, Exercise>();
  for (const ev of events) {
    if (ev.kind === 'exercise.upsert') map.set(ev.payload.id, ev.payload as Exercise);
    else if (ev.kind === 'exercise.delete') map.delete(ev.payload.id);
  }
  return Array.from(map.values());
}

export function reduceWorkouts(events: VaultEvent[]): Workout[] {
  return visibleTrainingEvents(events)
    .filter((e) => e.kind === 'workout.saved')
    .map((e) => e.payload as Workout);
}

export function reduceSessions(events: VaultEvent[]): Session[] {
  return visibleTrainingEvents(events)
    .filter((e) => e.kind === 'session.saved')
    .map((e) => e.payload as Session);
}

export function reducePRs(events: VaultEvent[]): PR[] {
  return visibleTrainingEvents(events)
    .filter((e) => e.kind === 'pr.achieved')
    .map((e) => e.payload as PR);
}

export function reduceWeights(events: VaultEvent[]): WeightEntry[] {
  return events
    .filter((e) => e.kind === 'weight.logged')
    .map((e) => e.payload as WeightEntry)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function reduceMeasurements(events: VaultEvent[]): MeasurementEntry[] {
  return events
    .filter((e) => e.kind === 'measurement.saved')
    .map((e) => ({ ...EMPTY_MEASURES, ...(e.payload as MeasurementEntry) }));
}

export function latestMeasurement(events: VaultEvent[]): MeasurementEntry | null {
  const ms = reduceMeasurements(events);
  return ms.length ? ms[ms.length - 1] : null;
}

export function reduceNutrition(events: VaultEvent[]): NutritionEntry[] {
  return events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.kind === 'nutrition.logged')
    .map(({ event, index }) => ({
      entry: {
        ...(event.payload as NutritionEntry),
        fiber: Number(event.payload?.fiber) || 0,
      },
      timestamp: event.timestamp,
      index,
    }))
    .sort(
      (a, b) =>
        a.entry.date.localeCompare(b.entry.date) ||
        a.timestamp.localeCompare(b.timestamp) ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);
}

export function latestNutrition(events: VaultEvent[], date: string): NutritionEntry | null {
  const list = reduceNutrition(events).filter((n) => n.date === date);
  return list.length ? list[list.length - 1] : null;
}

export function reduceRoutines(events: VaultEvent[]): Routine[] {
  const deleted = new Set(
    events.filter((e) => e.kind === 'routine.deleted').map((e) => e.payload?.id),
  );
  return events
    .filter((e) => e.kind === 'routine.saved')
    .map((e) => e.payload as Routine)
    .filter((r) => !deleted.has(r.id));
}

export function reducePlans(events: VaultEvent[]): Plan[] {
  const deleted = new Set(
    events.filter((e) => e.kind === 'plan.deleted').map((e) => e.payload?.id),
  );
  return events
    .filter((e) => e.kind === 'plan.saved')
    .map((e) => e.payload as Plan)
    .filter((p) => !deleted.has(p.id));
}

export function reduceMesocycles(events: VaultEvent[]): Mesocycle[] {
  const deleted = new Set(
    events.filter((e) => e.kind === 'mesocycle.deleted').map((e) => e.payload?.id),
  );
  return events
    .filter((e) => e.kind === 'mesocycle.saved')
    .map((e) => e.payload as Mesocycle)
    .filter((m) => !deleted.has(m.id));
}

export function reduceReminders(events: VaultEvent[]): Reminder[] {
  const deleted = new Set(
    events.filter((e) => e.kind === 'reminder.deleted').map((e) => e.payload?.id),
  );
  return events
    .filter((e) => e.kind === 'reminder.saved')
    .map((e) => e.payload as Reminder)
    .filter((r) => !deleted.has(r.id));
}

export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface ZoneLoad {
  zoneId: ZoneId;
  sets: number;
  minutes: number;
  lastDate: string;
  prs: number;
}

export interface TrainingSummary {
  sessions: Session[];
  workouts: Workout[];
  weekSessions: number;
  weekMinutes: number;
  weekSets: number;
  weekVolume: number;
  zoneLoad: Record<ZoneId, ZoneLoad>;
  topZone: ZoneId | null;
  totalPRs: number;
}

function emptyZoneLoad(): Record<ZoneId, ZoneLoad> {
  return Object.fromEntries(
    ZONES.map((z) => [z.id, { zoneId: z.id, sets: 0, minutes: 0, lastDate: '', prs: 0 }]),
  ) as Record<ZoneId, ZoneLoad>;
}

export function trainingSummary(
  events: VaultEvent[],
  exercises: Exercise[],
  now = new Date(),
): TrainingSummary {
  const sessions = reduceSessions(events);
  const workouts = reduceWorkouts(events);
  const prs = reducePRs(events);
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const sevenDaysAgo = todayISO(addDays(now, -6));
  const load = emptyZoneLoad();

  const applyEntry = (
    date: string,
    entry: { exerciseId: string; sets: { reps: number; weight: number }[] },
    shareMinutes: number,
  ) => {
    const ex = exerciseMap.get(entry.exerciseId);
    const zone = ex ? zoneForExercise(ex) : 'fullbody';
    const sets = entry.sets.length;
    if (date >= sevenDaysAgo) {
      load[zone].sets += sets;
      load[zone].minutes += shareMinutes;
    }
    if (!load[zone].lastDate || date > load[zone].lastDate) load[zone].lastDate = date;
  };

  let weekSessions = 0;
  let weekMinutes = 0;
  let weekSets = 0;
  let weekVolume = 0;

  for (const s of sessions) {
    const totalSets = s.entries.reduce((a, e) => a + (e.sets?.length ?? 0), 0);
    if (s.date >= sevenDaysAgo) {
      weekSessions += 1;
      weekMinutes += s.duration / 60;
    }
    for (const entry of s.entries) {
      const entrySets = entry.sets?.length ?? 0;
      const share = totalSets > 0 ? (s.duration / 60) * (entrySets / totalSets) : 0;
      applyEntry(s.date, entry, share);
      if (s.date >= sevenDaysAgo) {
        weekSets += entrySets;
        weekVolume += entry.sets.reduce((a, st) => a + st.reps * st.weight, 0);
      }
    }
  }

  for (const w of workouts) {
    for (const entry of w.entries) {
      const entrySets = entry.sets?.length ?? 0;
      applyEntry(w.date, entry, entrySets * 3);
      if (w.date >= sevenDaysAgo) {
        weekSets += entrySets;
        weekVolume += entry.sets.reduce((a, st) => a + st.reps * st.weight, 0);
      }
    }
    if (w.date >= sevenDaysAgo) {
      weekSessions += 1;
      weekMinutes += w.entries.reduce((a, e) => a + (e.sets?.length ?? 0) * 3, 0);
    }
  }

  for (const pr of prs) {
    const ex = exerciseMap.get(pr.exerciseId);
    const zone = ex ? zoneForExercise(ex) : 'fullbody';
    load[zone].prs += 1;
  }

  let topZone: ZoneId | null = null;
  let top = 0;
  for (const z of ZONES) {
    if (load[z.id].sets + load[z.id].minutes > top) {
      top = load[z.id].sets + load[z.id].minutes;
      topZone = z.id;
    }
  }

  return {
    sessions,
    workouts,
    weekSessions,
    weekMinutes: Math.round(weekMinutes),
    weekSets,
    weekVolume,
    zoneLoad: load,
    topZone,
    totalPRs: prs.length,
  };
}

export type AlertSeverity = 'high' | 'warn' | 'info';

export interface TrainingAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  zoneId?: ZoneId;
}

export function trainingAlerts(
  summary: TrainingSummary,
  now = new Date(),
): TrainingAlert[] {
  const alerts: TrainingAlert[] = [];
  const nowMs = now.getTime();

  for (const z of ZONES) {
    const load = summary.zoneLoad[z.id];
    const [, maxSets] = z.weeklySets;
    const [, maxMinutes] = z.weeklyMinutes;
    const isStrength = maxSets > 0;

    if (isStrength && load.sets > maxSets) {
      alerts.push({
        id: `${z.id}-sets`,
        severity: 'high',
        zoneId: z.id,
        title: `${z.name}: volumen semanal alto`,
        detail: `${load.sets} series en 7 días; el rango recomendado es ${z.weeklySets[0]}–${maxSets}. Reduce series o añade un día de descanso.`,
      });
    } else if (isStrength && load.sets >= maxSets * 0.85) {
      alerts.push({
        id: `${z.id}-near`,
        severity: 'info',
        zoneId: z.id,
        title: `${z.name}: cerca del límite`,
        detail: `${load.sets} series en 7 días. Te quedan ${Math.max(0, maxSets - load.sets)} series antes del máximo recomendado.`,
      });
    }

    if (load.minutes > maxMinutes) {
      alerts.push({
        id: `${z.id}-min`,
        severity: load.minutes > maxMinutes * 1.25 ? 'high' : 'warn',
        zoneId: z.id,
        title: `${z.name}: tiempo de trabajo excesivo`,
        detail: `${Math.round(load.minutes)} min en 7 días; el rango recomendado es ${z.weeklyMinutes[0]}–${maxMinutes} min.`,
      });
    }

    if (load.lastDate) {
      const hours = (nowMs - parseISO(load.lastDate).getTime()) / 3_600_000;
      if (hours < z.recoveryHours && load.sets >= maxSets * 0.7) {
        alerts.push({
          id: `${z.id}-recovery`,
          severity: 'warn',
          zoneId: z.id,
          title: `${z.name}: recuperación insuficiente`,
          detail: `Última sesión hace ${Math.max(1, Math.round(hours))} h. Se recomiendan al menos ${z.recoveryHours} h antes de volver a cargar esta zona.`,
        });
      }
    }
  }

  if (summary.weekMinutes > 600) {
    alerts.push({
      id: 'total-minutes',
      severity: 'warn',
      title: 'Carga semanal total elevada',
      detail: `${summary.weekMinutes} min de entrenamiento en 7 días. Incluye al menos un día de descanso completo.`,
    });
  }

  const order: Record<AlertSeverity, number> = { high: 0, warn: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

export interface MacroResult {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  bmr: number;
  tdee: number;
  activity: number;
  /** Nivel declarado por el usuario; `null` si se dedujo del entrenamiento. */
  activityLevel: ActivityLevel | null;
  fiber: number;
  missing: string[];
  notes: string[];
}

/**
 * Calcula los objetivos diarios. Si el usuario declara su nivel de actividad,
 * el gasto basal se multiplica por ese PAL (que ya incluye el ejercicio
 * habitual). Sin nivel declarado se mantiene la heurística antigua basada en
 * minutos semanales para no romper datos anteriores.
 */
export function computeMacros(
  m: BodyMeasures,
  weeklyMinutes: number,
  goal: GoalMode,
  activityLevel?: ActivityLevel,
): MacroResult | null {
  if (!m.weight || m.weight <= 0) return null;
  const missing: string[] = [];
  const notes: string[] = [];
  const height = m.height > 0 ? m.height : 170;
  if (m.height <= 0) {
    missing.push('altura');
    notes.push('Altura estimada en 170 cm.');
  }
  const age = m.age > 0 ? m.age : 30;
  if (m.age <= 0) {
    missing.push('edad');
    notes.push('Edad estimada en 30 años.');
  }
  if (m.sex === 'unspecified') {
    missing.push('sexo');
    notes.push('Sexo sin especificar: BMR con constante neutra.');
  }

  const sexConst = m.sex === 'male' ? 5 : m.sex === 'female' ? -161 : -78;
  const bmr = 10 * m.weight + 6.25 * height - 5 * age + sexConst;

  let activity: number;
  if (activityLevel && activityLevel !== 'auto') {
    activity = activityOption(activityLevel).multiplier;
    // Los multiplicadores PAL ya incluyen el ejercicio habitual (de 1,2
    // sedentario a 1,9 muy activo). Sumar otra vez los minutos registrados
    // duplicaría el gasto del entrenamiento y dispararía el objetivo calórico.
    notes.push(
      `Actividad declarada: ${activityOption(activityLevel).label} (×${activity}). ` +
        'El multiplicador ya incluye el entrenamiento habitual, así que no se suma dos veces.',
    );
  } else {
    activity = 1.2;
    if (weeklyMinutes >= 60) activity = 1.375;
    if (weeklyMinutes >= 150) activity = 1.55;
    if (weeklyMinutes >= 300) activity = 1.725;
    notes.push(
      `Actividad automática (×${activity}) según ${Math.round(weeklyMinutes)} min de entrenamiento en 7 días.`,
    );
  }
  const tdee = bmr * activity;
  const kcal = Math.round(tdee * (goal === 'cut' ? 0.85 : goal === 'bulk' ? 1.1 : 1));
  const proteinPerKg = goal === 'cut' ? 2.0 : 1.8;
  const protein = Math.round(m.weight * proteinPerKg);
  const fat = Math.round(Math.max(m.weight * 0.6, (kcal * 0.24) / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const waterMl = Math.round(
    m.weight * 35 + (weeklyMinutes / 7 / 60) * 500,
  );
  const fiber = Math.round(kcal * 0.014);

  return {
    kcal,
    protein,
    carbs,
    fat,
    waterMl,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    activity,
    activityLevel: activityLevel ?? null,
    fiber,
    missing,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* Agua: objetivo personalizado y límites de seguridad                */
/* ------------------------------------------------------------------ */

export type WaterStatus = 'none' | 'low' | 'below' | 'ok' | 'excess' | 'danger';

export interface WaterGuidance {
  targetMl: number;
  /** Límite superior razonable para tu composición y entrenamiento. */
  safeMaxMl: number;
  /** Por encima de este valor el riesgo de sobrehidratación es real. */
  hardMaxMl: number;
  status: WaterStatus;
  tone: 'info' | 'success' | 'warn' | 'danger';
  message: string;
  detail: string;
  leanMassKg: number | null;
  fatMassKg: number | null;
  exerciseAddMl: number;
  pctOfTarget: number;
  pctOfSafeMax: number;
}

/**
 * Estima el objetivo de agua y los límites de seguridad.
 *
 * El tejido magro contiene ~73 % de agua y el graso ~20 %, así que las
 * necesidades hídricas se ajustan mejor a la masa magra que al peso total.
 * Añadimos la reposición por entrenamiento (≈500 ml por hora media) y usamos
 * la capacidad renal de excreción (≈0,7–1,0 L/h) como referencia de seguridad:
 * superar de forma sostenida ese ritmo puede diluir el sodio plasmático.
 *
 * No es consejo médico: es una orientación para detectar excesos evidentes.
 */
export function computeWaterGuidance(
  m: BodyMeasures,
  weeklyMinutes: number,
  intakeMl: number,
): WaterGuidance {
  const intake = Math.max(0, Number(intakeMl) || 0);
  const weight = m.weight > 0 ? m.weight : 0;
  const comp = bodyComposition(m);
  const lean = comp.leanMass !== null && comp.leanMass > 0 ? comp.leanMass : weight * 0.8;
  const fat = Math.max(0, weight - lean);
  const exerciseAddMl = Math.round((Math.max(0, weeklyMinutes) / 7 / 60) * 500);

  // Con datos incompletos usamos una referencia de 70 kg (56 kg magros / 14 kg grasa).
  const effectiveLean = lean > 0 ? lean : 56;
  const effectiveFat = weight > 0 ? fat : 14;

  const targetMl = Math.round(effectiveLean * 40 + effectiveFat * 15 + exerciseAddMl);
  const safeMaxMl = Math.round(effectiveLean * 55 + effectiveFat * 20 + exerciseAddMl * 1.5);
  const hardMaxMl = Math.round(
    Math.max(safeMaxMl + 1200, effectiveLean * 80 + effectiveFat * 30),
  );

  const pctOfTarget = targetMl > 0 ? Math.round((intake / targetMl) * 100) : 0;
  const pctOfSafeMax = safeMaxMl > 0 ? Math.round((intake / safeMaxMl) * 100) : 0;

  let status: WaterStatus = 'ok';
  let tone: WaterGuidance['tone'] = 'success';
  let message = `Dentro de tu rango seguro (${(safeMaxMl / 1000).toFixed(1)} L).`;
  let detail = `Objetivo personalizado: ${(targetMl / 1000).toFixed(1)} L/día según masa magra (${effectiveLean.toFixed(1)} kg) y entrenamiento (${exerciseAddMl} ml extra).`;

  if (intake <= 0) {
    status = 'none';
    tone = 'info';
    message = 'Aún no has registrado agua hoy.';
    detail = `Tu objetivo es ${(targetMl / 1000).toFixed(1)} L. Reparte a lo largo del día en lugar de beber todo de golpe.`;
  } else if (intake < targetMl * 0.75) {
    status = 'low';
    tone = 'warn';
    message = `Vas bajo de hidratación: te faltan ${((targetMl - intake) / 1000).toFixed(2)} L para el objetivo.`;
    detail = 'Bebe en pequeños sorbos; la sed intensa y la orina oscura indican que ya vas tarde.';
  } else if (intake < targetMl) {
    status = 'below';
    tone = 'info';
    message = `Te quedan ${((targetMl - intake) / 1000).toFixed(2)} L para llegar a tu objetivo.`;
    detail = detail;
  } else if (intake <= safeMaxMl) {
    status = 'ok';
    tone = 'success';
    message = `Dentro de tu rango seguro (${(safeMaxMl / 1000).toFixed(1)} L).`;
    detail = detail;
  } else if (intake <= hardMaxMl) {
    status = 'excess';
    tone = 'danger';
    message = `Por encima de tu límite seguro por ${((intake - safeMaxMl) / 1000).toFixed(2)} L.`;
    detail = `Con tu masa magra y entrenamiento, no conviene pasar de ${(safeMaxMl / 1000).toFixed(1)} L al día. El riñón excreta ≈0,7–1,0 L/h; beber más rápido diluye el sodio. Reparte el agua y no fuerces.`;
  } else {
    status = 'danger';
    tone = 'danger';
    message = `Riesgo de sobrehidratación: ${(intake / 1000).toFixed(2)} L registrados.`;
    detail = `Superas el umbral de seguridad (${(hardMaxMl / 1000).toFixed(1)} L) para tu peso y composición. Para de beber, evita ejercicio intenso y busca atención médica si hay náuseas, confusión o dolor de cabeza.`;
  }

  return {
    targetMl,
    safeMaxMl,
    hardMaxMl,
    status,
    tone,
    message,
    detail,
    leanMassKg: comp.leanMass,
    fatMassKg: comp.fatMass,
    exerciseAddMl,
    pctOfTarget,
    pctOfSafeMax,
  };
}

/* ------------------------------------------------------------------ */
/* Saciedad: modelo multivariable basado en evidencia                  */
/* ------------------------------------------------------------------ */

export interface SatietyDriver {
  id: string;
  label: string;
  /** Puntuación del factor, 0–100. */
  value: number;
  /** Peso relativo dentro del índice. */
  weight: number;
  detail: string;
}

export interface SatietyContext {
  /** Gramos totales de comida registrados en el día. */
  grams?: number;
  bodyFat?: number | null;
  leanMass?: number | null;
  weightKg?: number;
  weeklyMinutes?: number;
}

export interface SatietyResult {
  /** Índice global de saciedad 0–100. */
  score: number;
  fullness: number;
  hormonal: number;
  hydration: number;
  energyDensity: number | null;
  mealGrams: number;
  drivers: SatietyDriver[];
  diagnosis: string;
  tip: string;
  tone: 'good' | 'warn' | 'bad' | 'info';
  /** Alias heredados para no romper consumidores antiguos. */
  pressure: number;
  biochem: number;
  combined: number;
}

/**
 * Modelo de saciedad con los factores que mejor predicen el apetito:
 *
 * - Proteína: el macro más saciante (GLP-1, PYY, CCK). Objetivo diario según
 *   peso y objetivo calórico.
 * - Fibra: aumenta el volumen/viscosidad y retrasa el vaciado gástrico.
 * - Peso/volumen del alimento: la distensión gástrica es una señal mecánica
 *   potente; 1–1,5 kg de comida al día es una referencia práctica.
 * - Densidad energética: a igual caloría, los alimentos con menos kcal/g
 *   sacian más (baja densidad → mayor peso y volumen).
 * - Agua: contribuye al volumen y a la hidratación; un déficit leve aumenta
 *   la sensación de hambre.
 * - Grasa: retrasa el vaciado gástrico, pero su efecto saciante por caloría es
 *   menor que el de la proteína.
 * - Composición corporal y entrenamiento: ajustan las necesidades; un % de
 *   grasa muy bajo o una carga alta de entrenamiento aumentan la drive.
 */
export function computeSatiety(
  n: NutritionEntry | null,
  macros: MacroResult | null,
  context: SatietyContext = {},
): SatietyResult | null {
  if (!n || !macros) return null;

  const grams = Math.max(0, Number(context.grams) || 0);
  const weightKg = context.weightKg && context.weightKg > 0 ? context.weightKg : 0;
  const bodyFat = context.bodyFat ?? null;
  const leanMass = context.leanMass ?? null;
  const weeklyMinutes = Math.max(0, context.weeklyMinutes ?? 0);

  // El tejido magro y el entrenamiento elevan la demanda; el % de grasa muy
  // bajo eleva la señal de hambre (adaptación energética).
  const bodyDemand = leanMass && weightKg > 0
    ? clamp(0.9 + (leanMass / weightKg - 0.75) * 0.4, 0.85, 1.15)
    : 1;
  const trainingDemand = clamp(1 + weeklyMinutes / 1200, 1, 1.2);
  const lowFatDrive = bodyFat !== null && bodyFat < 12 ? 1.08 : 1;
  const demand = bodyDemand * trainingDemand * lowFatDrive;

  const volumeTarget = 1200 * (weightKg > 0 ? clamp(weightKg / 75, 0.7, 1.5) : 1);
  const proteinTarget = Math.max(1, macros.protein);
  const fiberTarget = Math.max(25, macros.fiber);
  const fatTarget = Math.max(1, macros.fat);
  const waterTarget = Math.max(1, macros.waterMl);

  const volumeScore = clamp((grams / volumeTarget) * 100, 0, 100);
  const proteinScore = clamp((n.protein / proteinTarget) * 100, 0, 100);
  const fiberScore = clamp((n.fiber / fiberTarget) * 100, 0, 100);
  const hydrationScore = clamp((n.water / waterTarget) * 100, 0, 100);
  const fatScore = clamp((n.fat / fatTarget) * 100, 0, 100);
  const energyDensity = grams > 0 ? n.kcal / grams : null;
  const densityScore = energyDensity === null
    ? 50
    : clamp(((2.5 - energyDensity) / 1.5) * 100, 0, 100);

  // La saciedad percibida se normaliza por la demanda: con más entrenamiento o
  // menos grasa corporal hace falta más señal para sentirse igual de lleno.
  const normalize = (value: number) => clamp(value / demand, 0, 100);

  const volume = normalize(volumeScore);
  const protein = normalize(proteinScore);
  const fiber = normalize(fiberScore);
  const hydration = normalize(hydrationScore);
  const fat = normalize(fatScore);
  const density = normalize(densityScore);

  const fullness = clamp(volume * 0.7 + hydration * 0.2 + fiber * 0.1, 0, 100);
  const hormonal = clamp(protein * 0.55 + fiber * 0.3 + fat * 0.15, 0, 100);
  const score = clamp(
    volume * 0.25 +
      protein * 0.3 +
      fiber * 0.2 +
      hydration * 0.1 +
      fat * 0.05 +
      density * 0.1,
    0,
    100,
  );

  const drivers: SatietyDriver[] = [
    {
      id: 'protein',
      label: 'Proteína',
      value: Math.round(protein),
      weight: 30,
      detail: `${Math.round(n.protein)} g de ${proteinTarget} g objetivo diario. Es el macro más saciante.`,
    },
    {
      id: 'volume',
      label: 'Peso y volumen',
      value: Math.round(volume),
      weight: 25,
      detail: `${Math.round(grams)} g de comida; referencia ${Math.round(volumeTarget)} g/día. La distensión gástrica es una señal mecánica directa.`,
    },
    {
      id: 'fiber',
      label: 'Fibra',
      value: Math.round(fiber),
      weight: 20,
      detail: `${Math.round(n.fiber * 10) / 10} g de ${fiberTarget} g objetivo. Retrasa el vaciado gástrico y modula GLP-1/PYY.`,
    },
    {
      id: 'water',
      label: 'Agua',
      value: Math.round(hydration),
      weight: 10,
      detail: `${Math.round(n.water)} ml de ${Math.round(waterTarget)} ml. La deshidratación leve se confunde con hambre.`,
    },
    {
      id: 'density',
      label: 'Densidad energética',
      value: Math.round(density),
      weight: 10,
      detail: energyDensity === null
        ? 'Sin gramos registrados: no se puede estimar kcal/g.'
        : `${energyDensity.toFixed(2)} kcal/g. Por debajo de ~1,5 kcal/g se sacia más por caloría.`,
    },
    {
      id: 'fat',
      label: 'Grasa',
      value: Math.round(fat),
      weight: 5,
      detail: `${Math.round(n.fat)} g de ${fatTarget} g. Sacia por enlentecer el vaciado gástrico, pero aporta mucha energía.`,
    },
  ];

  let diagnosis = 'Saciedad moderada';
  let tip = 'Combina proteína, fibra, volumen y agua en cada comida para cubrir las señales mecánicas y hormonales.';
  let tone: SatietyResult['tone'] = 'info';

  if (score >= 70) {
    diagnosis = 'Saciedad alta';
    tip = 'Las señales de volumen, proteína y fibra están bien cubiertas. Mantén este patrón y vigila la densidad energética.';
    tone = 'good';
  } else if (score < 30) {
    diagnosis = 'Hambre probable';
    tip = 'Añade una fuente de proteína (25–40 g), fibra (8–12 g) y 300–500 g de alimentos con agua y volumen.';
    tone = 'bad';
  } else if (energyDensity !== null && energyDensity > 2.2) {
    diagnosis = 'Densidad energética alta';
    tip = 'La comida concentra muchas calorías en poco peso: añade verduras, fruta, legumbres o sopa para ganar volumen sin exceso de energía.';
    tone = 'warn';
  } else if (proteinScore < 65 && volumeScore < 65) {
    diagnosis = 'Poca proteína y poco volumen';
    tip = 'Sube proteína de calidad y el peso de la comida (verduras, fruta, legumbres) para activar saciedad mecánica y hormonal.';
    tone = 'warn';
  } else if (fiberScore < 60) {
    diagnosis = 'Falta fibra';
    tip = 'Añade 8–12 g de fibra por comida: legumbres, avena, fruta con piel, verduras o semillas.';
    tone = 'warn';
  } else if (proteinScore < 65) {
    diagnosis = 'Proteína insuficiente';
    tip = 'Reparte la proteína entre comidas (0,3–0,4 g/kg por comida) para sostener GLP-1/PYY y preservar masa magra.';
    tone = 'warn';
  } else if (hydrationScore < 60) {
    diagnosis = 'Hidratación baja';
    tip = 'Bebe agua junto a las comidas; la sed y el hambre comparten señales y la deshidratación reduce la saciedad.';
    tone = 'warn';
  } else if (volumeScore < 60) {
    diagnosis = 'Falta volumen';
    tip = 'La distensión gástrica es una de las señales más potentes: añade alimentos ricos en agua y fibra para llegar a 300–500 g por comida.';
    tone = 'warn';
  } else if (score >= 55) {
    diagnosis = 'Saciedad aceptable';
    tip = 'Buen equilibrio general. Si aparece hambre pronto, sube ligeramente proteína y volumen en la próxima comida.';
  }

  return {
    score: Math.round(score),
    fullness: Math.round(fullness),
    hormonal: Math.round(hormonal),
    hydration: Math.round(hydration),
    energyDensity,
    mealGrams: Math.round(grams),
    drivers,
    diagnosis,
    tip,
    tone,
    pressure: Math.round(fullness),
    biochem: Math.round(hormonal),
    combined: Math.round(score),
  };
}

export interface BodyFatMethod {
  id: string;
  name: string;
  value: number;
  note?: string;
}

export interface BodyComposition {
  methods: BodyFatMethod[];
  avg: number | null;
  min: number | null;
  max: number | null;
  bmi: number | null;
  fatMass: number | null;
  leanMass: number | null;
  whr: number | null;
  whtr: number | null;
  bmrMifflin: number | null;
  bmrKatch: number | null;
  bmrCunningham: number | null;
  tdee: number | null;
  missing: string[];
  used: string[];
}

function navy(m: BodyMeasures): number | null {
  const { neck, waist, hip, height, sex } = m;
  if (sex === 'unspecified' || !neck || !waist || !height) return null;
  if (sex === 'male') {
    if (waist <= neck) return null;
    return 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
  }
  if (!hip || waist + hip <= neck) return null;
  return 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(height)) - 450;
}

function rfm(m: BodyMeasures): number | null {
  if (m.sex === 'unspecified' || !m.waist || !m.height) return null;
  const base = m.sex === 'male' ? 64 : 76;
  return base - 20 * (m.height / m.waist);
}

function deurenberg(m: BodyMeasures, bmi: number): number | null {
  if (m.sex === 'unspecified' || !m.age || !bmi) return null;
  const s = m.sex === 'male' ? 1 : 0;
  return 1.2 * bmi + 0.23 * m.age - 10.8 * s - 5.4;
}

function cunBae(m: BodyMeasures, bmi: number): number | null {
  if (m.sex === 'unspecified' || !m.age || !bmi) return null;
  const s = m.sex === 'male' ? 0 : 1;
  return (
    -44.988 +
    0.503 * m.age +
    10.689 * s +
    3.172 * bmi -
    0.026 * bmi * bmi +
    0.181 * bmi * s -
    0.02 * bmi * m.age -
    0.005 * bmi * bmi * s +
    0.00021 * bmi * bmi * m.age
  );
}

export function bodyComposition(m: BodyMeasures): BodyComposition {
  const methods: BodyFatMethod[] = [];
  const missing: string[] = [];

  const n = navy(m);
  if (n !== null && Number.isFinite(n)) {
    methods.push({ id: 'navy', name: 'Marina (Navy)', value: n, note: 'Circunferencias + altura' });
  }
  const r = rfm(m);
  if (r !== null && Number.isFinite(r)) {
    methods.push({ id: 'rfm', name: 'RFM', value: r, note: 'Cintura + altura, sin peso' });
  }
  const hasWeightHeight = m.weight > 0 && m.height > 0;
  const bmi = hasWeightHeight ? m.weight / (m.height / 100) ** 2 : null;
  if (bmi !== null) {
    const d = deurenberg(m, bmi);
    if (d !== null && Number.isFinite(d)) {
      methods.push({ id: 'deurenberg', name: 'Deurenberg', value: d, note: 'IMC + edad + sexo' });
    }
    const c = cunBae(m, bmi);
    if (c !== null && Number.isFinite(c)) {
      methods.push({ id: 'cunbae', name: 'CUN-BAE', value: c, note: 'IMC + edad + sexo' });
    }
  }

  const values = methods.map((x) => x.value);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const fatMass = avg !== null && m.weight > 0 ? (m.weight * avg) / 100 : null;
  const leanMass = fatMass !== null ? m.weight - fatMass : null;

  if (!n && !r) {
    if (!m.waist) missing.push('cintura');
    if (!m.height) missing.push('altura');
    if (m.sex === 'unspecified') missing.push('sexo');
    if (!m.neck) missing.push('cuello');
    if (m.sex !== 'male' && !m.hip) missing.push('cadera');
  }
  if (!hasWeightHeight && m.weight > 0) missing.push('altura');
  if (m.weight <= 0) missing.push('peso');
  if (!m.age) missing.push('edad');

  let bmrMifflin: number | null = null;
  if (m.weight > 0 && m.height > 0) {
    const age = m.age > 0 ? m.age : 30;
    const sexConst = m.sex === 'male' ? 5 : m.sex === 'female' ? -161 : -78;
    bmrMifflin = 10 * m.weight + 6.25 * m.height - 5 * age + sexConst;
  }
  const bmrKatch = leanMass !== null ? 370 + 21.6 * leanMass : null;
  const bmrCunningham = leanMass !== null ? 500 + 22 * leanMass : null;
  const tdee = bmrMifflin !== null ? bmrMifflin * 1.55 : null;

  return {
    methods,
    avg,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    bmi,
    fatMass,
    leanMass,
    whr: m.waist > 0 && m.hip > 0 ? m.waist / m.hip : null,
    whtr: m.waist > 0 && m.height > 0 ? m.waist / m.height : null,
    bmrMifflin,
    bmrKatch,
    bmrCunningham,
    tdee,
    missing: [...new Set(missing)],
    used: methods.map((x) => x.name),
  };
}

export interface BodyProgressPoint {
  date: string;
  bodyFat: number | null;
  fatMass: number | null;
  leanMass: number | null;
  waist: number | null;
  weight: number | null;
}

/**
 * Serie de progreso corporal para el gráfico de grasa.
 *
 * El % de grasa puede estimarse solo con cintura + altura (RFM), así que la
 * gráfica funciona sin báscula. La masa grasa en kg requiere además el peso.
 * Si hay varias medidas en la misma fecha, gana el último evento guardado.
 */
export function bodyProgressSeries(events: VaultEvent[]): BodyProgressPoint[] {
  const byDate = new Map<string, MeasurementEntry>();
  for (const event of events) {
    if (event.kind !== 'measurement.saved') continue;
    const raw = event.payload as Partial<MeasurementEntry> | null;
    if (!raw || typeof raw.date !== 'string' || !raw.date) continue;
    byDate.set(raw.date, { ...EMPTY_MEASURES, ...raw, date: raw.date });
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((measurement) => {
      const comp = bodyComposition(measurement);
      return {
        date: measurement.date,
        bodyFat: comp.avg,
        fatMass: comp.fatMass,
        leanMass: comp.leanMass,
        waist: measurement.waist > 0 ? measurement.waist : null,
        weight: measurement.weight > 0 ? measurement.weight : null,
      };
    });
}

export function estimate1RM(weight: number, reps: number): { epley: number | null; brzycki: number | null } {
  if (!weight || !reps) return { epley: null, brzycki: null };
  return {
    epley: reps <= 12 ? weight * (1 + reps / 30) : null,
    brzycki: reps < 37 ? (weight * 36) / (37 - reps) : null,
  };
}

export interface WeeklyPoint {
  key: string;
  label: string;
  volume: number;
  sets: number;
  minutes: number;
  sessions: number;
}

export function weeklySeries(
  events: VaultEvent[],
  exercises: Exercise[],
  weeks = 8,
  now = new Date(),
): WeeklyPoint[] {
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const buckets = new Map<string, WeeklyPoint>();
  const start = startOfWeek(now);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = addDays(start, -i * 7);
    const key = todayISO(d);
    buckets.set(key, {
      key,
      label: d.toLocaleDateString('es', { day: '2-digit', month: 'short' }),
      volume: 0,
      sets: 0,
      minutes: 0,
      sessions: 0,
    });
  }

  const add = (date: string, volume: number, sets: number, minutes: number) => {
    const key = weekKey(date);
    const b = buckets.get(key);
    if (!b) return;
    b.volume += volume;
    b.sets += sets;
    b.minutes += minutes;
    b.sessions += 1;
  };

  for (const s of reduceSessions(events)) {
    let volume = 0;
    let sets = 0;
    for (const e of s.entries) {
      const ex = exerciseMap.get(e.exerciseId);
      if (!ex) continue;
      sets += e.sets.length;
      volume += e.sets.reduce((a, st) => a + st.reps * st.weight, 0);
    }
    add(s.date, volume, sets, s.duration / 60);
  }
  for (const w of reduceWorkouts(events)) {
    let volume = 0;
    let sets = 0;
    for (const e of w.entries) {
      const ex = exerciseMap.get(e.exerciseId);
      if (!ex) continue;
      sets += e.sets.length;
      volume += e.sets.reduce((a, st) => a + st.reps * st.weight, 0);
    }
    add(w.date, volume, sets, sets * 3);
  }

  return Array.from(buckets.values());
}

export interface ExercisePoint {
  date: string;
  label: string;
  maxWeight: number;
  volume: number;
  pr: boolean;
}

export function exerciseSeries(
  events: VaultEvent[],
  exerciseId: string,
): ExercisePoint[] {
  const prs = new Set(reducePRs(events).filter((p) => p.exerciseId === exerciseId).map((p) => p.date));
  const points: ExercisePoint[] = [];
  for (const s of reduceSessions(events)) {
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const maxWeight = Math.max(0, ...entry.sets.map((x) => x.weight || 0));
    points.push({
      date: s.date,
      label: formatShort(s.date),
      maxWeight,
      volume: entry.sets.reduce((a, x) => a + x.reps * x.weight, 0),
      pr: prs.has(s.date),
    });
  }
  for (const w of reduceWorkouts(events)) {
    const entry = w.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const maxWeight = Math.max(0, ...entry.sets.map((x) => x.weight || 0));
    points.push({
      date: w.date,
      label: formatShort(w.date),
      maxWeight,
      volume: entry.sets.reduce((a, x) => a + x.reps * x.weight, 0),
      pr: prs.has(w.date),
    });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}
