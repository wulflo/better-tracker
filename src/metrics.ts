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
  Sex,
  VaultEvent,
  WeightEntry,
  Workout,
  WorkoutEntry,
  Mesocycle,
  Plan,
} from './types';
import type { Lang } from './i18n';
import { locale, tx } from './i18n';
import { EMPTY_MEASURES } from './types';
import { ZONES, ZONE_MAP, type ZoneId, zoneForExercise, zoneName } from './zones';

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

export function formatShort(date: string, lang: Lang = 'es'): string {
  const d = parseISO(date);
  return d.toLocaleDateString(locale(lang), { day: '2-digit', month: 'short' });
}

export function formatLong(date: string, lang: Lang = 'es'): string {
  const d = parseISO(date);
  return d.toLocaleDateString(locale(lang), { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Fecha de una proyección: siempre incluye el año, porque los hitos pueden caer
 * en años distintos y una fecha sin año se vuelve ambigua.
 */
export function formatProjectionDate(date: string, lang: Lang = 'es'): string {
  const d = parseISO(date);
  return d.toLocaleDateString(locale(lang), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function monthLabel(d: Date, lang: Lang = 'es'): string {
  const label = d.toLocaleDateString(locale(lang), { month: 'long', year: 'numeric' });
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

const ACTIVITY_EN: Record<ActivityLevel, { label: string; short: string; description: string }> = {
  auto: {
    label: 'Automatic',
    short: 'Auto',
    description: 'Calculated from the last 7 days of training minutes. Pick a level if you prefer to set it manually.',
  },
  sedentary: {
    label: 'Sedentary',
    short: 'Sedentary',
    description: 'Office job, little movement and no regular training.',
  },
  light: {
    label: 'Light',
    short: 'Light',
    description: 'Daily walking, standing job or 1–2 workouts per week.',
  },
  moderate: {
    label: 'Moderate',
    short: 'Moderate',
    description: 'Normal daily activity and 3–4 workouts per week.',
  },
  high: {
    label: 'High',
    short: 'High',
    description: 'Physical job or 5–6 intense workouts per week.',
  },
  very_high: {
    label: 'Very high',
    short: 'Very high',
    description: 'Very physical job, double sessions or competitive sport.',
  },
};

export function activityLevelFromEvents(events: VaultEvent[]): ActivityLevel {
  const last = [...events].reverse().find((e) => e.kind === 'activity.level');
  const level = last?.payload?.level;
  if (level === 'auto') return 'auto';
  return ACTIVITY_LEVELS.some((option) => option.id === level) ? (level as ActivityLevel) : 'auto';
}

export function activityOption(level: ActivityLevel, lang: Lang = 'es'): ActivityOption {
  const base = level === 'auto'
    ? AUTO_ACTIVITY
    : ACTIVITY_LEVELS.find((option) => option.id === level) ?? AUTO_ACTIVITY;
  if (lang === 'es') return base;
  const en = ACTIVITY_EN[base.id];
  return { ...base, label: en.label, short: en.short, description: en.description };
}

export function activityOptions(lang: Lang = 'es'): ActivityOption[] {
  return [AUTO_ACTIVITY, ...ACTIVITY_LEVELS].map((option) => activityOption(option.id, lang));
}

/**
 * Pasos diarios medios como proxy de la actividad espontánea (NEAT). Los
 * cortes son heurísticos: no sustituyen al nivel declarado, pero evitan
 * infravalorar el gasto cuando alguien camina mucho aunque no lo registre como
 * entrenamiento.
 */
export function stepActivityMultiplier(avgSteps: number): number | null {
  if (!Number.isFinite(avgSteps) || avgSteps <= 0) return null;
  if (avgSteps < 4000) return 1.2;
  if (avgSteps < 6000) return 1.3;
  if (avgSteps < 8000) return 1.4;
  if (avgSteps < 10000) return 1.5;
  if (avgSteps < 12500) return 1.6;
  if (avgSteps < 15000) return 1.725;
  return 1.85;
}

/** Último promedio de pasos diarios guardado, o 0 si no hay dato. */
export function averageStepsFromEvents(events: VaultEvent[]): number {
  const last = [...events].reverse().find((e) => e.kind === 'steps.average');
  const steps = Number(last?.payload?.steps);
  return Number.isFinite(steps) && steps > 0 ? steps : 0;
}

export type FrequencyUnit = 'week' | 'month';

export interface TrainingFrequency {
  perWeek: number;
  /** Unidad que eligió el usuario; solo afecta a cómo se muestra el campo. */
  unit: FrequencyUnit;
}

/**
 * Frecuencia de entrenamiento declarada. Se guarda siempre normalizada a
 * sesiones por semana para que la proyección no dependa de la unidad elegida.
 */
export function trainingFrequencyFromEvents(events: VaultEvent[]): TrainingFrequency | null {
  const last = [...events].reverse().find((e) => e.kind === 'training.frequency');
  if (!last) return null;
  const raw = Number(last.payload?.perWeek);
  if (!Number.isFinite(raw) || raw < 0) return null;
  return {
    perWeek: clamp(raw, 0, 21),
    unit: last.payload?.unit === 'month' ? 'month' : 'week',
  };
}

/** Ingesta media declarada a mano, o 0 si no hay dato. */
export function averageIntakeFromEvents(events: VaultEvent[]): number {
  const last = [...events].reverse().find((e) => e.kind === 'intake.average');
  const kcal = Number(last?.payload?.kcal);
  return Number.isFinite(kcal) && kcal > 0 ? clamp(kcal, 500, 10000) : 0;
}

/**
 * Media de calorías de los días con log en una ventana reciente. Se usa solo
 * como respaldo cuando el usuario no ha escrito su media habitual; los días sin
 * registro no cuentan.
 */
export function loggedIntakeAverage(
  events: VaultEvent[],
  days = 28,
  now = new Date(),
): { avg: number; days: number } {
  const windowDays = Math.max(1, Math.round(days));
  const cutoff = todayISO(addDays(now, -(windowDays - 1)));
  const byDate = new Map<string, number>();
  for (const entry of reduceNutrition(events)) {
    if (!entry?.date || entry.date < cutoff) continue;
    const kcal = Number(entry.kcal);
    if (!Number.isFinite(kcal) || kcal <= 0) continue;
    byDate.set(entry.date, kcal);
  }
  const values = [...byDate.values()];
  if (!values.length) return { avg: 0, days: 0 };
  return {
    avg: Math.round(values.reduce((total, value) => total + value, 0) / values.length),
    days: values.length,
  };
}

export function historyCutoff(events: VaultEvent[]): string {
  const last = [...events].reverse().find((e) => e.kind === 'history.cleared');
  return typeof last?.payload?.at === 'string' ? last.payload.at : '';
}

const TRAINING_KINDS = new Set(['session.saved', 'workout.saved', 'pr.achieved']);

function deletedTrainingKeys(events: VaultEvent[]): {
  eventIds: Set<string>;
  payloadIds: Set<string>;
} {
  const eventIds = new Set<string>();
  const payloadIds = new Set<string>();
  for (const event of events) {
    if (event.kind !== 'training.deleted') continue;
    const eventId = event.payload?.eventId;
    const payloadId = event.payload?.payloadId;
    if (typeof eventId === 'string' && eventId) eventIds.add(eventId);
    if (typeof payloadId === 'string' && payloadId) payloadIds.add(payloadId);
  }
  return { eventIds, payloadIds };
}

export function visibleTrainingEvents(events: VaultEvent[]): VaultEvent[] {
  const cutoff = historyCutoff(events);
  const { eventIds, payloadIds } = deletedTrainingKeys(events);
  return events.filter((e) => {
    if (!TRAINING_KINDS.has(e.kind)) return true;
    // El borrado individual se guarda como lápida append-only. Se comprueba
    // también el id del payload para que una restauración con otro id de evento
    // no haga reaparecer el mismo entrenamiento.
    if (eventIds.has(e.id)) return false;
    if (typeof e.payload?.id === 'string' && payloadIds.has(e.payload.id)) return false;
    return !cutoff || e.timestamp > cutoff;
  });
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
  const routines = new Map<string, Routine>();
  for (const event of events) {
    if (event.kind !== 'routine.saved') continue;
    const routine = event.payload as Routine;
    if (!routine?.id) continue;
    // Al renombrar o editar una rutina se guarda otro evento con el mismo id:
    // el mapa conserva el orden original y se queda con la última versión.
    routines.set(routine.id, routine);
  }
  return Array.from(routines.values()).filter((r) => !deleted.has(r.id));
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
  /** Sesiones (entrenamientos o sesiones) registradas en los últimos 30 días. */
  monthSessions: number;
  /** Días distintos con al menos un ejercicio de fuerza en los últimos 30 días. */
  monthStrengthSessions: number;
  /** Indicador mensual de fuerza: sesiones de fuerza en los últimos 30 días. */
  strengthPerMonth: number;
  /** Días distintos con algún entrenamiento en los últimos 30 días. */
  monthTrainingDays: number;
  /** Media de minutos por día de entrenamiento en los últimos 30 días. */
  avgSessionMinutes: number;
  /** Días de entrenamiento por semana en los últimos 30 días. */
  observedSessionsPerWeek: number;
  /** Días de fuerza por semana en los últimos 30 días. */
  observedStrengthPerWeek: number;
  /** Proporción de días de fuerza sobre días de entrenamiento (0–1). */
  strengthShare: number | null;
  zoneLoad: Record<ZoneId, ZoneLoad>;
  topZone: ZoneId | null;
  totalPRs: number;
}

function hasStrengthWork(entries: WorkoutEntry[], exercises: Map<string, Exercise>): boolean {
  return entries.some((entry) => {
    const exercise = exercises.get(entry.exerciseId);
    // Las sesiones antiguas pueden no tener metadatos del ejercicio: en ese
    // caso se asume fuerza, que es el tipo por defecto de la app.
    return !exercise || !exercise.type || exercise.type === 'fuerza';
  });
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
  const thirtyDaysAgo = todayISO(addDays(now, -29));
  const load = emptyZoneLoad();
  const strengthDates = new Set<string>();
  const trainingMinutes = new Map<string, number>();
  let monthSessions = 0;

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
    if (s.date >= thirtyDaysAgo) {
      monthSessions += 1;
      const minutes = s.duration / 60;
      trainingMinutes.set(s.date, (trainingMinutes.get(s.date) ?? 0) + minutes);
      if (hasStrengthWork(s.entries, exerciseMap)) strengthDates.add(s.date);
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
    const estimatedMinutes = w.entries.reduce((a, e) => a + (e.sets?.length ?? 0) * 3, 0);
    if (w.date >= thirtyDaysAgo) {
      monthSessions += 1;
      trainingMinutes.set(w.date, (trainingMinutes.get(w.date) ?? 0) + estimatedMinutes);
      if (hasStrengthWork(w.entries, exerciseMap)) strengthDates.add(w.date);
    }
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
      weekMinutes += estimatedMinutes;
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

  const monthTrainingDays = trainingMinutes.size;
  const totalMonthMinutes = [...trainingMinutes.values()].reduce((total, value) => total + value, 0);
  const avgSessionMinutes = monthTrainingDays > 0 ? totalMonthMinutes / monthTrainingDays : 0;
  const observedSessionsPerWeek = monthTrainingDays > 0 ? monthTrainingDays / (30 / 7) : 0;
  const observedStrengthPerWeek = strengthDates.size > 0 ? strengthDates.size / (30 / 7) : 0;
  const strengthShare = monthTrainingDays > 0 ? strengthDates.size / monthTrainingDays : null;

  return {
    sessions,
    workouts,
    weekSessions,
    weekMinutes: Math.round(weekMinutes),
    weekSets,
    weekVolume,
    monthSessions,
    monthStrengthSessions: strengthDates.size,
    strengthPerMonth: strengthDates.size,
    monthTrainingDays,
    avgSessionMinutes: Math.round(avgSessionMinutes),
    observedSessionsPerWeek: Math.round(observedSessionsPerWeek * 10) / 10,
    observedStrengthPerWeek: Math.round(observedStrengthPerWeek * 10) / 10,
    strengthShare,
    zoneLoad: load,
    topZone,
    totalPRs: prs.length,
  };
}

export type AlertSeverity = 'high' | 'warn' | 'info';

export interface TrainingEstimate {
  declaredPerWeek: number | null;
  loggedPerWeek: number;
  effectivePerWeek: number;
  avgSessionMinutes: number;
  weeklyMinutes: number;
  strengthPerMonth: number;
  source: 'declared' | 'logged' | 'mixed' | 'none';
  /** No hay fuerza registrada: se asume que las sesiones declaradas son de fuerza. */
  assumedStrength: boolean;
}

/**
 * Combina la frecuencia declarada con la observada. La declarada evita
 * infravalorar el gasto cuando el usuario solo registra algunos días; la
 * observada sirve de suelo cuando entrena más de lo que declara. La duración
 * media sale de los entrenamientos existentes para no inventar minutos.
 */
export function estimateTraining(
  summary: TrainingSummary,
  declaredPerWeek: number | null,
): TrainingEstimate {
  const declared =
    declaredPerWeek !== null && Number.isFinite(declaredPerWeek)
      ? clamp(declaredPerWeek, 0, 21)
      : null;
  const logged = Math.max(0, summary.observedSessionsPerWeek);
  const effective = declared !== null ? Math.max(declared, logged) : logged;
  const avgSessionMinutes =
    summary.avgSessionMinutes > 0
      ? clamp(summary.avgSessionMinutes, 15, 180)
      : effective > 0
        ? 45
        : 0;
  const weeklyMinutes = clamp(
    Math.max(effective * avgSessionMinutes, summary.weekMinutes),
    0,
    1500,
  );
  const share = summary.strengthShare;
  const strengthPerMonth =
    effective > 0
      ? clamp(
          Math.max(
            share !== null ? effective * share * (30 / 7) : effective * (30 / 7),
            summary.strengthPerMonth,
          ),
          0,
          31,
        )
      : 0;
  const source: TrainingEstimate['source'] =
    effective <= 0
      ? 'none'
      : declared === null
        ? 'logged'
        : declared > logged
          ? 'declared'
          : declared < logged
            ? 'logged'
            : 'mixed';

  return {
    declaredPerWeek: declared,
    loggedPerWeek: Math.round(logged * 10) / 10,
    effectivePerWeek: Math.round(effective * 10) / 10,
    avgSessionMinutes: Math.round(avgSessionMinutes),
    weeklyMinutes: Math.round(weeklyMinutes),
    strengthPerMonth: Math.round(strengthPerMonth * 10) / 10,
    source,
    assumedStrength: share === null && effective > 0,
  };
}

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
  lang: Lang = 'es',
): TrainingAlert[] {
  const alerts: TrainingAlert[] = [];
  const nowMs = now.getTime();

  for (const z of ZONES) {
    const load = summary.zoneLoad[z.id];
    const [, maxSets] = z.weeklySets;
    const [, maxMinutes] = z.weeklyMinutes;
    const isStrength = maxSets > 0;
    const name = zoneName(z.id, lang);

    if (isStrength && load.sets > maxSets) {
      alerts.push({
        id: `${z.id}-sets`,
        severity: 'high',
        zoneId: z.id,
        title: tx(lang, `${z.name}: volumen semanal alto`, `${name}: high weekly volume`),
        detail: tx(
          lang,
          `${load.sets} series en 7 días; el rango recomendado es ${z.weeklySets[0]}–${maxSets}. Reduce series o añade un día de descanso.`,
          `${load.sets} sets in 7 days; the recommended range is ${z.weeklySets[0]}–${maxSets}. Reduce sets or add a rest day.`,
        ),
      });
    } else if (isStrength && load.sets >= maxSets * 0.85) {
      alerts.push({
        id: `${z.id}-near`,
        severity: 'info',
        zoneId: z.id,
        title: tx(lang, `${z.name}: cerca del límite`, `${name}: close to the limit`),
        detail: tx(
          lang,
          `${load.sets} series en 7 días. Te quedan ${Math.max(0, maxSets - load.sets)} series antes del máximo recomendado.`,
          `${load.sets} sets in 7 days. You have ${Math.max(0, maxSets - load.sets)} sets left before the recommended maximum.`,
        ),
      });
    }

    if (load.minutes > maxMinutes) {
      alerts.push({
        id: `${z.id}-min`,
        severity: load.minutes > maxMinutes * 1.25 ? 'high' : 'warn',
        zoneId: z.id,
        title: tx(lang, `${z.name}: tiempo de trabajo excesivo`, `${name}: excessive working time`),
        detail: tx(
          lang,
          `${Math.round(load.minutes)} min en 7 días; el rango recomendado es ${z.weeklyMinutes[0]}–${maxMinutes} min.`,
          `${Math.round(load.minutes)} min in 7 days; the recommended range is ${z.weeklyMinutes[0]}–${maxMinutes} min.`,
        ),
      });
    }

    if (load.lastDate) {
      const hours = (nowMs - parseISO(load.lastDate).getTime()) / 3_600_000;
      if (hours < z.recoveryHours && load.sets >= maxSets * 0.7) {
        alerts.push({
          id: `${z.id}-recovery`,
          severity: 'warn',
          zoneId: z.id,
          title: tx(lang, `${z.name}: recuperación insuficiente`, `${name}: insufficient recovery`),
          detail: tx(
            lang,
            `Última sesión hace ${Math.max(1, Math.round(hours))} h. Se recomiendan al menos ${z.recoveryHours} h antes de volver a cargar esta zona.`,
            `Last session ${Math.max(1, Math.round(hours))} h ago. At least ${z.recoveryHours} h are recommended before loading this zone again.`,
          ),
        });
      }
    }
  }

  if (summary.weekMinutes > 600) {
    alerts.push({
      id: 'total-minutes',
      severity: 'warn',
      title: tx(lang, 'Carga semanal total elevada', 'High total weekly load'),
      detail: tx(
        lang,
        `${summary.weekMinutes} min de entrenamiento en 7 días. Incluye al menos un día de descanso completo.`,
        `${summary.weekMinutes} min of training in 7 days. Include at least one full rest day.`,
      ),
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
  /** Pasos diarios medios usados para ajustar el gasto (0 si no hay dato). */
  steps: number;
  /** Multiplicador orientativo que sugieren esos pasos. */
  stepActivity: number | null;
  fiber: number;
  missing: string[];
  notes: string[];
}

/**
 * Gasto basal con Mifflin-St Jeor. Se expone porque la proyección lo recalcula
 * semana a semana con el peso simulado, no solo con el peso actual.
 */
export function bmrMifflin(weight: number, height: number, age: number, sex: Sex): number {
  const sexConst = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return 10 * weight + 6.25 * height - 5 * age + sexConst;
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
  lang: Lang = 'es',
  avgSteps = 0,
): MacroResult | null {
  if (!m.weight || m.weight <= 0) return null;
  const missing: string[] = [];
  const notes: string[] = [];
  const height = m.height > 0 ? m.height : 170;
  if (m.height <= 0) {
    missing.push(tx(lang, 'altura', 'height'));
    notes.push(tx(lang, 'Altura estimada en 170 cm.', 'Height estimated at 170 cm.'));
  }
  const age = m.age > 0 ? m.age : 30;
  if (m.age <= 0) {
    missing.push(tx(lang, 'edad', 'age'));
    notes.push(tx(lang, 'Edad estimada en 30 años.', 'Age estimated at 30 years.'));
  }
  if (m.sex === 'unspecified') {
    missing.push(tx(lang, 'sexo', 'sex'));
    notes.push(tx(lang, 'Sexo sin especificar: BMR con constante neutra.', 'Sex not specified: BMR with a neutral constant.'));
  }

  const bmr = bmrMifflin(m.weight, height, age, m.sex);

  let activity: number;
  if (activityLevel && activityLevel !== 'auto') {
    activity = activityOption(activityLevel).multiplier;
    // Los multiplicadores PAL ya incluyen el ejercicio habitual (de 1,2
    // sedentario a 1,9 muy activo). Sumar otra vez los minutos registrados
    // duplicaría el gasto del entrenamiento y dispararía el objetivo calórico.
    const option = activityOption(activityLevel, lang);
    notes.push(
      tx(
        lang,
        `Actividad declarada: ${option.label} (×${activity}). El multiplicador ya incluye el entrenamiento habitual, así que no se suma dos veces.`,
        `Declared activity: ${option.label} (×${activity}). The multiplier already includes habitual training, so it is not added twice.`,
      ),
    );
  } else {
    activity = 1.2;
    if (weeklyMinutes >= 60) activity = 1.375;
    if (weeklyMinutes >= 150) activity = 1.55;
    if (weeklyMinutes >= 300) activity = 1.725;
    notes.push(
      tx(
        lang,
        `Actividad automática (×${activity}) según ${Math.round(weeklyMinutes)} min de entrenamiento en 7 días.`,
        `Automatic activity (×${activity}) based on ${Math.round(weeklyMinutes)} min of training in 7 days.`,
      ),
    );
  }

  // Los pasos medios cubren la actividad espontánea. Se usa el mayor de los
  // dos multiplicadores para no sumar dos veces el mismo gasto: un nivel
  // declarado alto puede incluir fuerza que no aparece en los pasos.
  const stepActivity = stepActivityMultiplier(avgSteps);
  if (stepActivity !== null) {
    if (stepActivity > activity + 1e-9) {
      notes.push(
        tx(
          lang,
          `Pasos: ${Math.round(avgSteps)}/día (×${stepActivity.toFixed(3)}). Se toma este multiplicador porque supera al de actividad (×${activity.toFixed(3)}).`,
          `Steps: ${Math.round(avgSteps)}/day (×${stepActivity.toFixed(3)}). This multiplier is used because it exceeds the activity one (×${activity.toFixed(3)}).`,
        ),
      );
      activity = stepActivity;
    } else {
      notes.push(
        tx(
          lang,
          `Pasos: ${Math.round(avgSteps)}/día (×${stepActivity.toFixed(3)}). Tu nivel de actividad ya cubre ese gasto (×${activity.toFixed(3)}).`,
          `Steps: ${Math.round(avgSteps)}/day (×${stepActivity.toFixed(3)}). Your activity level already covers that expenditure (×${activity.toFixed(3)}).`,
        ),
      );
    }
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
    steps: Math.max(0, Math.round(avgSteps)),
    stepActivity,
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
  lang: Lang = 'es',
): WaterGuidance {
  const intake = Math.max(0, Number(intakeMl) || 0);
  const weight = m.weight > 0 ? m.weight : 0;
  const comp = bodyComposition(m, lang);
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
  let message = tx(
    lang,
    `Dentro de tu rango seguro (${(safeMaxMl / 1000).toFixed(1)} L).`,
    `Within your safe range (${(safeMaxMl / 1000).toFixed(1)} L).`,
  );
  let detail = tx(
    lang,
    `Objetivo personalizado: ${(targetMl / 1000).toFixed(1)} L/día según masa magra (${effectiveLean.toFixed(1)} kg) y entrenamiento (${exerciseAddMl} ml extra).`,
    `Personalized target: ${(targetMl / 1000).toFixed(1)} L/day based on lean mass (${effectiveLean.toFixed(1)} kg) and training (${exerciseAddMl} ml extra).`,
  );

  if (intake <= 0) {
    status = 'none';
    tone = 'info';
    message = tx(lang, 'Aún no has registrado agua hoy.', 'You have not logged any water today.');
    detail = tx(
      lang,
      `Tu objetivo es ${(targetMl / 1000).toFixed(1)} L. Reparte a lo largo del día en lugar de beber todo de golpe.`,
      `Your target is ${(targetMl / 1000).toFixed(1)} L. Spread it throughout the day instead of drinking it all at once.`,
    );
  } else if (intake < targetMl * 0.75) {
    status = 'low';
    tone = 'warn';
    message = tx(
      lang,
      `Vas bajo de hidratación: te faltan ${((targetMl - intake) / 1000).toFixed(2)} L para el objetivo.`,
      `You are behind on hydration: ${((targetMl - intake) / 1000).toFixed(2)} L short of your target.`,
    );
    detail = tx(
      lang,
      'Bebe en pequeños sorbos; la sed intensa y la orina oscura indican que ya vas tarde.',
      'Take small sips; intense thirst and dark urine mean you are already late.',
    );
  } else if (intake < targetMl) {
    status = 'below';
    tone = 'info';
    message = tx(
      lang,
      `Te quedan ${((targetMl - intake) / 1000).toFixed(2)} L para llegar a tu objetivo.`,
      `${((targetMl - intake) / 1000).toFixed(2)} L left to reach your target.`,
    );
  } else if (intake <= safeMaxMl) {
    status = 'ok';
    tone = 'success';
    message = tx(
      lang,
      `Dentro de tu rango seguro (${(safeMaxMl / 1000).toFixed(1)} L).`,
      `Within your safe range (${(safeMaxMl / 1000).toFixed(1)} L).`,
    );
  } else if (intake <= hardMaxMl) {
    status = 'excess';
    tone = 'danger';
    message = tx(
      lang,
      `Por encima de tu límite seguro por ${((intake - safeMaxMl) / 1000).toFixed(2)} L.`,
      `${((intake - safeMaxMl) / 1000).toFixed(2)} L above your safe limit.`,
    );
    detail = tx(
      lang,
      `Con tu masa magra y entrenamiento, no conviene pasar de ${(safeMaxMl / 1000).toFixed(1)} L al día. El riñón excreta ≈0,7–1,0 L/h; beber más rápido diluye el sodio. Reparte el agua y no fuerces.`,
      `With your lean mass and training, it is best not to exceed ${(safeMaxMl / 1000).toFixed(1)} L per day. The kidneys excrete ≈0.7–1.0 L/h; drinking faster dilutes sodium. Spread out your water and do not force it.`,
    );
  } else {
    status = 'danger';
    tone = 'danger';
    message = tx(
      lang,
      `Riesgo de sobrehidratación: ${(intake / 1000).toFixed(2)} L registrados.`,
      `Risk of overhydration: ${(intake / 1000).toFixed(2)} L logged.`,
    );
    detail = tx(
      lang,
      `Superas el umbral de seguridad (${(hardMaxMl / 1000).toFixed(1)} L) para tu peso y composición. Para de beber, evita ejercicio intenso y busca atención médica si hay náuseas, confusión o dolor de cabeza.`,
      `You exceed the safety threshold (${(hardMaxMl / 1000).toFixed(1)} L) for your weight and composition. Stop drinking, avoid intense exercise and seek medical help if you have nausea, confusion or a headache.`,
    );
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
  lang: Lang = 'es',
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
      label: tx(lang, 'Proteína', 'Protein'),
      value: Math.round(protein),
      weight: 30,
      detail: tx(
        lang,
        `${Math.round(n.protein)} g de ${proteinTarget} g objetivo diario. Es el macro más saciante.`,
        `${Math.round(n.protein)} g of a ${proteinTarget} g daily target. It is the most satiating macronutrient.`,
      ),
    },
    {
      id: 'volume',
      label: tx(lang, 'Peso y volumen', 'Weight and volume'),
      value: Math.round(volume),
      weight: 25,
      detail: tx(
        lang,
        `${Math.round(grams)} g de comida; referencia ${Math.round(volumeTarget)} g/día. La distensión gástrica es una señal mecánica directa.`,
        `${Math.round(grams)} g of food; reference ${Math.round(volumeTarget)} g/day. Gastric distension is a direct mechanical signal.`,
      ),
    },
    {
      id: 'fiber',
      label: tx(lang, 'Fibra', 'Fiber'),
      value: Math.round(fiber),
      weight: 20,
      detail: tx(
        lang,
        `${Math.round(n.fiber * 10) / 10} g de ${fiberTarget} g objetivo. Retrasa el vaciado gástrico y modula GLP-1/PYY.`,
        `${Math.round(n.fiber * 10) / 10} g of a ${fiberTarget} g target. It slows gastric emptying and modulates GLP-1/PYY.`,
      ),
    },
    {
      id: 'water',
      label: tx(lang, 'Agua', 'Water'),
      value: Math.round(hydration),
      weight: 10,
      detail: tx(
        lang,
        `${Math.round(n.water)} ml de ${Math.round(waterTarget)} ml. La deshidratación leve se confunde con hambre.`,
        `${Math.round(n.water)} ml of ${Math.round(waterTarget)} ml. Mild dehydration is often mistaken for hunger.`,
      ),
    },
    {
      id: 'density',
      label: tx(lang, 'Densidad energética', 'Energy density'),
      value: Math.round(density),
      weight: 10,
      detail: energyDensity === null
        ? tx(lang, 'Sin gramos registrados: no se puede estimar kcal/g.', 'No grams logged: kcal/g cannot be estimated.')
        : tx(
            lang,
            `${energyDensity.toFixed(2)} kcal/g. Por debajo de ~1,5 kcal/g se sacia más por caloría.`,
            `${energyDensity.toFixed(2)} kcal/g. Below ~1.5 kcal/g you feel fuller per calorie.`,
          ),
    },
    {
      id: 'fat',
      label: tx(lang, 'Grasa', 'Fat'),
      value: Math.round(fat),
      weight: 5,
      detail: tx(
        lang,
        `${Math.round(n.fat)} g de ${fatTarget} g. Sacia por enlentecer el vaciado gástrico, pero aporta mucha energía.`,
        `${Math.round(n.fat)} g of ${fatTarget} g. It satisfies by slowing gastric emptying, but brings a lot of energy.`,
      ),
    },
  ];

  let diagnosis = tx(lang, 'Saciedad moderada', 'Moderate satiety');
  let tip = tx(
    lang,
    'Combina proteína, fibra, volumen y agua en cada comida para cubrir las señales mecánicas y hormonales.',
    'Combine protein, fiber, volume and water in each meal to cover the mechanical and hormonal signals.',
  );
  let tone: SatietyResult['tone'] = 'info';

  if (score >= 70) {
    diagnosis = tx(lang, 'Saciedad alta', 'High satiety');
    tip = tx(
      lang,
      'Las señales de volumen, proteína y fibra están bien cubiertas. Mantén este patrón y vigila la densidad energética.',
      'Volume, protein and fiber signals are well covered. Keep this pattern and watch energy density.',
    );
    tone = 'good';
  } else if (score < 30) {
    diagnosis = tx(lang, 'Hambre probable', 'Likely hunger');
    tip = tx(
      lang,
      'Añade una fuente de proteína (25–40 g), fibra (8–12 g) y 300–500 g de alimentos con agua y volumen.',
      'Add a protein source (25–40 g), fiber (8–12 g) and 300–500 g of water-rich, high-volume foods.',
    );
    tone = 'bad';
  } else if (energyDensity !== null && energyDensity > 2.2) {
    diagnosis = tx(lang, 'Densidad energética alta', 'High energy density');
    tip = tx(
      lang,
      'La comida concentra muchas calorías en poco peso: añade verduras, fruta, legumbres o sopa para ganar volumen sin exceso de energía.',
      'The meal packs many calories into little weight: add vegetables, fruit, legumes or soup to gain volume without excess energy.',
    );
    tone = 'warn';
  } else if (proteinScore < 65 && volumeScore < 65) {
    diagnosis = tx(lang, 'Poca proteína y poco volumen', 'Low protein and low volume');
    tip = tx(
      lang,
      'Sube proteína de calidad y el peso de la comida (verduras, fruta, legumbres) para activar saciedad mecánica y hormonal.',
      'Increase quality protein and meal weight (vegetables, fruit, legumes) to activate mechanical and hormonal satiety.',
    );
    tone = 'warn';
  } else if (fiberScore < 60) {
    diagnosis = tx(lang, 'Falta fibra', 'Not enough fiber');
    tip = tx(
      lang,
      'Añade 8–12 g de fibra por comida: legumbres, avena, fruta con piel, verduras o semillas.',
      'Add 8–12 g of fiber per meal: legumes, oats, fruit with skin, vegetables or seeds.',
    );
    tone = 'warn';
  } else if (proteinScore < 65) {
    diagnosis = tx(lang, 'Proteína insuficiente', 'Not enough protein');
    tip = tx(
      lang,
      'Reparte la proteína entre comidas (0,3–0,4 g/kg por comida) para sostener GLP-1/PYY y preservar masa magra.',
      'Spread protein across meals (0.3–0.4 g/kg per meal) to sustain GLP-1/PYY and preserve lean mass.',
    );
    tone = 'warn';
  } else if (hydrationScore < 60) {
    diagnosis = tx(lang, 'Hidratación baja', 'Low hydration');
    tip = tx(
      lang,
      'Bebe agua junto a las comidas; la sed y el hambre comparten señales y la deshidratación reduce la saciedad.',
      'Drink water with meals; thirst and hunger share signals and dehydration reduces satiety.',
    );
    tone = 'warn';
  } else if (volumeScore < 60) {
    diagnosis = tx(lang, 'Falta volumen', 'Not enough volume');
    tip = tx(
      lang,
      'La distensión gástrica es una de las señales más potentes: añade alimentos ricos en agua y fibra para llegar a 300–500 g por comida.',
      'Gastric distension is one of the strongest signals: add water- and fiber-rich foods to reach 300–500 g per meal.',
    );
    tone = 'warn';
  } else if (score >= 55) {
    diagnosis = tx(lang, 'Saciedad aceptable', 'Acceptable satiety');
    tip = tx(
      lang,
      'Buen equilibrio general. Si aparece hambre pronto, sube ligeramente proteína y volumen en la próxima comida.',
      'Good overall balance. If hunger appears soon, slightly increase protein and volume at the next meal.',
    );
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
  /** Peso dentro del consenso, en porcentaje (0–100). */
  weight?: number;
  /** Fiabilidad orientativa 0–1 derivada del error publicado. */
  reliability?: number;
  /** Familia de medidas; evita que varios métodos correlacionados dominen. */
  family?: string;
  /** Número de entradas propias que usa la ecuación. */
  inputs?: number;
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
  /** Consenso ponderado 0–100 según precisión, cobertura y acuerdo. */
  confidence: number | null;
  /** Porcentaje de campos relevantes informados 0–100. */
  coverage: number;
}

const LB_PER_KG = 2.2046226218;

function validBodyFat(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 1.5 && value <= 70;
}

/** Abdomen al ombligo; si no existe, la cintura como aproximación. */
function bellyCircumference(m: BodyMeasures): number {
  if (m.abdomen > 0) return m.abdomen;
  return m.waist > 0 ? m.waist : 0;
}

/** Cintura natural; si no existe, el abdomen como aproximación. */
function naturalWaist(m: BodyMeasures): number {
  if (m.waist > 0) return m.waist;
  return m.abdomen > 0 ? m.abdomen : 0;
}

function navy(m: BodyMeasures): number | null {
  const { neck, hip, height, sex } = m;
  const waist = naturalWaist(m);
  const abdomen = bellyCircumference(m);
  if (sex === 'unspecified' || !neck || !height) return null;
  if (sex === 'male') {
    if (!abdomen || abdomen <= neck) return null;
    return 495 / (1.0324 - 0.19077 * Math.log10(abdomen - neck) + 0.15456 * Math.log10(height)) - 450;
  }
  if (!hip || waist + hip <= neck) return null;
  return 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(height)) - 450;
}

function rfm(m: BodyMeasures): number | null {
  const waist = naturalWaist(m);
  if (m.sex === 'unspecified' || !waist || !m.height) return null;
  const base = m.sex === 'male' ? 64 : 76;
  return base - 20 * (m.height / waist);
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

/** Army (Vogel et al., 1988), hombres: cm. */
function armyMen(m: BodyMeasures): number | null {
  const abdomen = bellyCircumference(m);
  if (m.sex !== 'male' || !abdomen || !m.neck || !m.height || abdomen <= m.neck) return null;
  return 76.5 * Math.log10(abdomen - m.neck) - 68.7 * Math.log10(m.height) + 46.9;
}

/** Army (Vogel et al., 1988), mujeres: kg y cm. */
function armyWomen(m: BodyMeasures): number | null {
  if (
    m.sex !== 'female' ||
    !m.weight ||
    !m.wrist ||
    !m.neck ||
    !m.forearm ||
    !m.hip ||
    !m.height
  ) {
    return null;
  }
  return (
    105.3 * Math.log10(m.weight) -
    0.2 * m.wrist -
    0.533 * m.neck -
    1.574 * m.forearm +
    0.173 * m.hip -
    0.515 * m.height -
    35.6
  );
}

/** Army one-site (2023): solo peso y abdomen al ombligo. */
function armyOneSite(m: BodyMeasures): number | null {
  const abdomen = bellyCircumference(m);
  if (m.sex === 'unspecified' || !m.weight || !abdomen) return null;
  const lb = m.weight * LB_PER_KG;
  const inches = abdomen / 2.54;
  if (m.sex === 'male') return -26.97 - 0.12 * lb + 1.99 * inches;
  return -9.15 - 0.015 * lb + 1.27 * inches;
}

/** Marine Corps (Wright et al., 1980), hombres: cm. */
function marineMen(m: BodyMeasures): number | null {
  const abdomen = bellyCircumference(m);
  if (m.sex !== 'male' || !abdomen || !m.neck) return null;
  return 0.74 * abdomen - 1.249 * m.neck + 0.985;
}

/** Marine Corps (Wright et al., 1980), mujeres: cm. */
function marineWomen(m: BodyMeasures): number | null {
  const abdomen = bellyCircumference(m);
  if (m.sex !== 'female' || !m.arm || !m.forearm || !m.neck || !abdomen || !m.thigh) {
    return null;
  }
  return (
    1.051 * m.arm -
    1.522 * m.forearm -
    0.879 * m.neck +
    0.326 * abdomen +
    0.597 * m.thigh +
    0.707
  );
}

/** Friedl & Vogel (1997), hombres: cm. */
function friedl(m: BodyMeasures): number | null {
  const abdomen = bellyCircumference(m);
  if (m.sex !== 'male' || !abdomen || !m.neck || !m.height || abdomen <= m.neck) return null;
  return 0.771 * (abdomen - m.neck) - 0.132 * m.height + 4.29;
}

interface FatCandidate {
  id: string;
  name: string;
  value: number;
  note: string;
  family: string;
  see: number;
  inputs: number;
}

export function bodyComposition(m: BodyMeasures, lang: Lang = 'es'): BodyComposition {
  const candidates: FatCandidate[] = [];
  const missing = new Set<string>();

  const add = (
    id: string,
    name: string,
    value: number | null,
    note: string,
    family: string,
    see: number,
    inputs: number,
  ) => {
    if (validBodyFat(value)) candidates.push({ id, name, value, note, family, see, inputs });
  };

  const n = navy(m);
  add(
    'navy',
    tx(lang, 'Marina/Air Force', 'Navy/Air Force'),
    n,
    tx(lang, 'Cuello, cintura/abdomen, altura y cadera (mujeres)', 'Neck, waist/abdomen, height and hip (women)'),
    m.sex === 'female' ? 'waist-hip' : 'abdominal',
    3.5,
    m.sex === 'female' ? 4 : 3,
  );
  const r = rfm(m);
  add(
    'rfm',
    'RFM',
    r,
    tx(lang, 'Cintura + altura, sin peso', 'Waist + height, no weight'),
    'waist-height',
    4.5,
    2,
  );
  const hasWeightHeight = m.weight > 0 && m.height > 0;
  const bmi = hasWeightHeight ? m.weight / (m.height / 100) ** 2 : null;
  if (bmi !== null) {
    add(
      'deurenberg',
      'Deurenberg',
      deurenberg(m, bmi),
      tx(lang, 'IMC + edad + sexo', 'BMI + age + sex'),
      'bmi',
      4.6,
      3,
    );
    add(
      'cunbae',
      'CUN-BAE',
      cunBae(m, bmi),
      tx(lang, 'IMC + edad + sexo', 'BMI + age + sex'),
      'bmi',
      4.0,
      3,
    );
  }
  add(
    'army',
    tx(lang, 'Ejército (Vogel)', 'Army (Vogel)'),
    armyMen(m),
    tx(lang, 'Abdomen + cuello + altura', 'Abdomen + neck + height'),
    'abdominal',
    4.02,
    3,
  );
  add(
    'army-women',
    tx(lang, 'Ejército mujeres (Vogel)', 'Army women (Vogel)'),
    armyWomen(m),
    tx(lang, 'Peso + muñeca + cuello + antebrazo + cadera + altura', 'Weight + wrist + neck + forearm + hip + height'),
    'multi-site',
    3.6,
    6,
  );
  add(
    'army-2023',
    tx(lang, 'Ejército actual (2023)', 'Current Army (2023)'),
    armyOneSite(m),
    tx(lang, 'Peso + abdomen al ombligo', 'Weight + navel abdomen'),
    'abdominal',
    4.0,
    2,
  );
  add(
    'marine',
    tx(lang, 'Marines (Wright)', 'Marine Corps (Wright)'),
    marineMen(m),
    tx(lang, 'Abdomen + cuello', 'Abdomen + neck'),
    'abdominal',
    3.67,
    2,
  );
  add(
    'marine-women',
    tx(lang, 'Marines mujeres (Wright)', 'Marine women (Wright)'),
    marineWomen(m),
    tx(lang, 'Brazo + antebrazo + cuello + abdomen + muslo', 'Arm + forearm + neck + abdomen + thigh'),
    'multi-site',
    4.11,
    5,
  );
  add(
    'friedl',
    'Friedl',
    friedl(m),
    tx(lang, 'Abdomen + cuello + altura', 'Abdomen + neck + height'),
    'abdominal',
    3.9,
    3,
  );

  // Peso por familia: cada familia aporta como mucho la media de sus métodos,
  // así cinco ecuaciones abdominales no eclipsan a las de IMC o multi-sitio.
  const byFamily = new Map<string, FatCandidate[]>();
  for (const c of candidates) {
    const list = byFamily.get(c.family) ?? [];
    list.push(c);
    byFamily.set(c.family, list);
  }
  const rawOf = (c: FatCandidate) => {
    const reliability = clamp(1 - (c.see - 3) / 6, 0.45, 0.98);
    return reliability ** 2 * (1 + 0.04 * Math.max(0, c.inputs - 2));
  };
  const familyWeight = new Map<string, number>();
  for (const [family, list] of byFamily) {
    familyWeight.set(
      family,
      list.reduce((sum, c) => sum + rawOf(c), 0) / list.length,
    );
  }
  const totalFamilyWeight = [...familyWeight.values()].reduce((a, b) => a + b, 0);
  const methods: BodyFatMethod[] = [];
  let weighted = 0;
  for (const [family, list] of byFamily) {
    const familyRaw = list.reduce((sum, c) => sum + rawOf(c), 0);
    for (const c of list) {
      const weight = totalFamilyWeight > 0
        ? ((familyWeight.get(family) ?? 0) * (rawOf(c) / familyRaw) / totalFamilyWeight) * 100
        : 0;
      methods.push({
        id: c.id,
        name: c.name,
        value: c.value,
        note: c.note,
        weight,
        reliability: clamp(1 - (c.see - 3) / 6, 0.45, 0.98),
        family: c.family,
        inputs: c.inputs,
      });
      weighted += c.value * weight;
    }
  }

  const values = methods.map((x) => x.value);
  const avg = totalFamilyWeight > 0 ? weighted / 100 : null;
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const fatMass = avg !== null && m.weight > 0 ? (m.weight * avg) / 100 : null;
  const leanMass = fatMass !== null ? m.weight - fatMass : null;

  // Cobertura: solo campos que alguna ecuación puede aprovechar para ese
  // sexo. Pecho y pantorrilla siguen en la silueta, pero no inflan la
  // confianza porque ninguna fórmula de grasa los usa.
  const relevant =
    m.sex === 'female'
      ? [m.age, m.weight, m.height, m.neck, m.waist, m.abdomen, m.hip, m.arm, m.forearm, m.thigh, m.wrist]
      : m.sex === 'male'
        ? [m.age, m.weight, m.height, m.neck, m.waist, m.abdomen]
        : [m.age, m.weight, m.height, m.neck, m.waist, m.abdomen, m.hip, m.arm, m.forearm, m.thigh, m.wrist];
  const covered = (m.sex !== 'unspecified' ? 1 : 0) + relevant.filter((value) => value > 0).length;
  const coverage = Math.round((covered / (relevant.length + 1)) * 100);

  let confidence: number | null = null;
  if (methods.length && avg !== null) {
    const meanReliability = methods.reduce(
      (sum, method) => sum + (method.reliability ?? 0.5) * ((method.weight ?? 0) / 100),
      0,
    );
    const spread = values.length > 1
      ? Math.sqrt(
          methods.reduce(
            (sum, method) => sum + ((method.value - avg) ** 2) * ((method.weight ?? 0) / 100),
            0,
          ),
        )
      : 0;
    const agreement = clamp(1 - spread / 20, 0.65, 1);
    const coverageFactor = 0.55 + 0.45 * (coverage / 100);
    const methodFactor = clamp(methods.length / 3, 0.75, 1);
    confidence = Math.round(
      clamp(meanReliability * coverageFactor * agreement * methodFactor * 100, 15, 95),
    );
  }

  if (m.sex === 'unspecified') missing.add(tx(lang, 'sexo', 'sex'));
  if (m.age <= 0) missing.add(tx(lang, 'edad', 'age'));
  if (m.weight <= 0) missing.add(tx(lang, 'peso', 'weight'));
  if (m.height <= 0) missing.add(tx(lang, 'altura', 'height'));
  if (m.neck <= 0) missing.add(tx(lang, 'cuello', 'neck'));
  if (m.waist <= 0 && m.abdomen <= 0) missing.add(tx(lang, 'cintura', 'waist'));
  if (m.abdomen <= 0) missing.add(tx(lang, 'abdomen (ombligo)', 'abdomen (navel)'));
  if (m.sex === 'female') {
    if (m.hip <= 0) missing.add(tx(lang, 'cadera', 'hip'));
    if (m.forearm <= 0) missing.add(tx(lang, 'antebrazo', 'forearm'));
    if (m.wrist <= 0) missing.add(tx(lang, 'muñeca', 'wrist'));
    if (m.arm <= 0) missing.add(tx(lang, 'brazo', 'arm'));
    if (m.thigh <= 0) missing.add(tx(lang, 'muslo', 'thigh'));
  }

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
    min,
    max,
    bmi,
    fatMass,
    leanMass,
    whr: m.waist > 0 && m.hip > 0 ? m.waist / m.hip : null,
    whtr: m.waist > 0 && m.height > 0 ? m.waist / m.height : null,
    bmrMifflin,
    bmrKatch,
    bmrCunningham,
    tdee,
    missing: [...missing],
    used: methods.map((x) => x.name),
    confidence,
    coverage,
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
  lang: Lang = 'es',
): WeeklyPoint[] {
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const buckets = new Map<string, WeeklyPoint>();
  const start = startOfWeek(now);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = addDays(start, -i * 7);
    const key = todayISO(d);
    buckets.set(key, {
      key,
      label: d.toLocaleDateString(locale(lang), { day: '2-digit', month: 'short' }),
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
  lang: Lang = 'es',
): ExercisePoint[] {
  const prs = new Set(reducePRs(events).filter((p) => p.exerciseId === exerciseId).map((p) => p.date));
  const points: ExercisePoint[] = [];
  for (const s of reduceSessions(events)) {
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const maxWeight = Math.max(0, ...entry.sets.map((x) => x.weight || 0));
    points.push({
      date: s.date,
      label: formatShort(s.date, lang),
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
      label: formatShort(w.date, lang),
      maxWeight,
      volume: entry.sets.reduce((a, x) => a + x.reps * x.weight, 0),
      pr: prs.has(w.date),
    });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}
