import type { Exercise } from './types';

export type ZoneId =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'legs'
  | 'calves'
  | 'cardio'
  | 'mobility'
  | 'fullbody';

export interface Zone {
  id: ZoneId;
  name: string;
  color: string;
  muscles: string[];
  weeklySets: [number, number];
  weeklyMinutes: [number, number];
  recoveryHours: number;
  body: boolean;
}

export const ZONES: Zone[] = [
  {
    id: 'chest',
    name: 'Pecho',
    color: '#ff8fab',
    muscles: ['Pectoral mayor', 'Pectoral menor', 'Serrato anterior'],
    weeklySets: [10, 20],
    weeklyMinutes: [45, 120],
    recoveryHours: 48,
    body: true,
  },
  {
    id: 'back',
    name: 'Espalda',
    color: '#8ecae6',
    muscles: ['Dorsal ancho', 'Romboides', 'Trapecio', 'Erectores espinales'],
    weeklySets: [10, 20],
    weeklyMinutes: [45, 120],
    recoveryHours: 48,
    body: true,
  },
  {
    id: 'shoulders',
    name: 'Hombros',
    color: '#b8a1ff',
    muscles: ['Deltoides anterior', 'Deltoides lateral', 'Deltoides posterior', 'Manguito rotador'],
    weeklySets: [8, 16],
    weeklyMinutes: [30, 90],
    recoveryHours: 48,
    body: true,
  },
  {
    id: 'arms',
    name: 'Brazos',
    color: '#ffd166',
    muscles: ['Bíceps braquial', 'Braquial', 'Tríceps braquial', 'Braquiorradial'],
    weeklySets: [8, 16],
    weeklyMinutes: [30, 90],
    recoveryHours: 48,
    body: true,
  },
  {
    id: 'core',
    name: 'Core',
    color: '#95d5b2',
    muscles: ['Recto abdominal', 'Oblicuos', 'Transverso abdominal', 'Suelo pélvico'],
    weeklySets: [6, 16],
    weeklyMinutes: [20, 60],
    recoveryHours: 24,
    body: true,
  },
  {
    id: 'legs',
    name: 'Piernas',
    color: '#f4a261',
    muscles: ['Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Aductores'],
    weeklySets: [10, 20],
    weeklyMinutes: [60, 150],
    recoveryHours: 48,
    body: true,
  },
  {
    id: 'calves',
    name: 'Pantorrillas',
    color: '#e9c46a',
    muscles: ['Gastrocnemio', 'Sóleo', 'Tibial anterior'],
    weeklySets: [6, 16],
    weeklyMinutes: [20, 60],
    recoveryHours: 24,
    body: true,
  },
  {
    id: 'cardio',
    name: 'Cardio',
    color: '#ff6b6b',
    muscles: ['Corazón', 'Pulmones', 'Sistema circulatorio'],
    weeklySets: [0, 0],
    weeklyMinutes: [90, 300],
    recoveryHours: 12,
    body: false,
  },
  {
    id: 'mobility',
    name: 'Movilidad',
    color: '#90e0ef',
    muscles: ['Articulaciones', 'Tendones', 'Fascia'],
    weeklySets: [0, 0],
    weeklyMinutes: [30, 120],
    recoveryHours: 12,
    body: false,
  },
  {
    id: 'fullbody',
    name: 'Cuerpo completo',
    color: '#c77dff',
    muscles: ['Todos los grupos principales'],
    weeklySets: [8, 20],
    weeklyMinutes: [60, 180],
    recoveryHours: 48,
    body: true,
  },
];

export const ZONE_MAP: Record<ZoneId, Zone> = Object.fromEntries(
  ZONES.map((z) => [z.id, z]),
) as Record<ZoneId, Zone>;

export const BODY_ZONES = ZONES.filter((z) => z.body);

export const ZONE_OPTIONS = ZONES.map((z) => ({
  value: z.id,
  label: z.name,
  hint: z.muscles.slice(0, 3).join(' · '),
}));

export const TYPE_OPTIONS = [
  { value: 'fuerza', label: 'Fuerza', hint: 'Series, reps y carga' },
  { value: 'cardio', label: 'Cardio', hint: 'Duración y pulso' },
  { value: 'movilidad', label: 'Movilidad', hint: 'Rango articular' },
  { value: 'calentamiento', label: 'Calentamiento', hint: 'Activación' },
];

const KEYWORDS: Array<[ZoneId, string[]]> = [
  ['chest', ['pecho', 'pectoral', 'serrato', 'press banca', 'flexion']],
  ['back', ['espalda', 'dorsal', 'remo', 'jalon', 'dominada', 'trapecio', 'romboide', 'peso muerto']],
  ['shoulders', ['hombro', 'deltoide', 'manguito', 'elevacion lateral', 'press militar']],
  ['arms', ['biceps', 'triceps', 'braquial', 'braquiorradial', 'curl', 'antebrazo']],
  ['core', ['core', 'abdomen', 'abdominal', 'oblicuo', 'plancha', 'lumbar']],
  ['legs', ['pierna', 'cuadriceps', 'isquio', 'gluteo', 'sentadilla', 'prensa', 'zancada', 'adductor']],
  ['calves', ['pantorrilla', 'gemelo', 'soleo', 'tibial']],
  ['cardio', ['cardio', 'correr', 'carrera', 'bici', 'ciclismo', 'remo ergometro', 'natacion', 'cuerda']],
  ['mobility', ['movilidad', 'estiramiento', 'yoga', 'flexibilidad']],
];

export function zoneForExercise(ex: Pick<Exercise, 'zone' | 'muscle' | 'type' | 'name'>): ZoneId {
  if (ex.zone && ZONE_MAP[ex.zone as ZoneId]) return ex.zone as ZoneId;
  if (ex.type === 'cardio') return 'cardio';
  if (ex.type === 'movilidad') return 'mobility';
  const text = `${ex.muscle ?? ''} ${ex.name ?? ''}`.toLowerCase();
  for (const [zone, words] of KEYWORDS) {
    if (words.some((w) => text.includes(w))) return zone;
  }
  return 'fullbody';
}

export function zoneName(id: ZoneId): string {
  return ZONE_MAP[id]?.name ?? 'Otro';
}

export function zoneColor(id: ZoneId): string {
  return ZONE_MAP[id]?.color ?? '#c77dff';
}
