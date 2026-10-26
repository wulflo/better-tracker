import type {
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
    .filter((e) => e.kind === 'nutrition.logged')
    .map((e) => ({ ...(e.payload as NutritionEntry), fiber: Number(e.payload?.fiber) || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
  fiber: number;
  missing: string[];
  notes: string[];
}

export function computeMacros(
  m: BodyMeasures,
  weeklyMinutes: number,
  goal: GoalMode,
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

  let activity = 1.2;
  if (weeklyMinutes >= 60) activity = 1.375;
  if (weeklyMinutes >= 150) activity = 1.55;
  if (weeklyMinutes >= 300) activity = 1.725;
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
    fiber,
    missing,
    notes,
  };
}

export interface SatietyResult {
  pressure: number;
  biochem: number;
  combined: number;
  diagnosis: string;
  tip: string;
  tone: 'good' | 'warn' | 'bad' | 'info';
}

export function computeSatiety(
  n: NutritionEntry | null,
  macros: MacroResult | null,
): SatietyResult | null {
  if (!n || !macros) return null;
  const fiberTarget = Math.max(25, macros.fiber);
  const proteinTarget = Math.max(1, macros.protein);
  const fatTarget = Math.max(1, macros.fat);
  const waterTarget = Math.max(1, macros.waterMl / 1000);

  const pressure = clamp(
    50 * (n.fiber / fiberTarget) +
      30 * (n.water / 1000 / waterTarget) +
      20 * (n.protein / proteinTarget),
    0,
    100,
  );
  const biochem = clamp(
    45 * (n.protein / proteinTarget) +
      35 * (n.fiber / fiberTarget) +
      20 * (n.fat / fatTarget),
    0,
    100,
  );
  const combined = (pressure + biochem) / 2;

  let diagnosis = 'Señal mixta';
  let tip = 'Reparte proteína, fibra y agua a lo largo del día para cubrir ambas vías.';
  let tone: SatietyResult['tone'] = 'info';

  if (pressure < 45 && biochem >= 55) {
    diagnosis = 'Presión baja, bioquímica alta';
    tip = 'La señal química está bien, pero falta volumen: añade fibra, agua y vegetales para distender el estómago.';
    tone = 'warn';
  } else if (pressure >= 55 && biochem < 45) {
    diagnosis = 'Presión alta, bioquímica baja';
    tip = 'Mucho volumen y poca señal química: sube proteína de calidad y grasas saludables para activar GLP-1/PYY.';
    tone = 'warn';
  } else if (pressure < 45 && biochem < 45) {
    diagnosis = 'Ambas vías bajas';
    tip = 'Hambre probable: combina proteína, fibra y agua en la próxima comida.';
    tone = 'bad';
  } else if (pressure >= 55 && biochem >= 55) {
    diagnosis = 'Saciedad dual equilibrada';
    tip = 'Presión gástrica y señal bioquímica cubiertas. Buen control del apetito.';
    tone = 'good';
  }

  return { pressure, biochem, combined, diagnosis, tip, tone };
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
