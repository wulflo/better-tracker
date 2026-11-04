import type { Lang } from './i18n';
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

type ZoneText = { name: string; muscles: string[] };

const ZONE_EN: Record<ZoneId, ZoneText> = {
  chest: {
    name: 'Chest',
    muscles: ['Pectoralis major', 'Pectoralis minor', 'Serratus anterior'],
  },
  back: {
    name: 'Back',
    muscles: ['Latissimus dorsi', 'Rhomboids', 'Trapezius', 'Spinal erectors'],
  },
  shoulders: {
    name: 'Shoulders',
    muscles: ['Anterior deltoid', 'Lateral deltoid', 'Posterior deltoid', 'Rotator cuff'],
  },
  arms: {
    name: 'Arms',
    muscles: ['Biceps brachii', 'Brachialis', 'Triceps brachii', 'Brachioradialis'],
  },
  core: {
    name: 'Core',
    muscles: ['Rectus abdominis', 'Obliques', 'Transverse abdominis', 'Pelvic floor'],
  },
  legs: {
    name: 'Legs',
    muscles: ['Quadriceps', 'Hamstrings', 'Glutes', 'Adductors'],
  },
  calves: {
    name: 'Calves',
    muscles: ['Gastrocnemius', 'Soleus', 'Tibialis anterior'],
  },
  cardio: {
    name: 'Cardio',
    muscles: ['Heart', 'Lungs', 'Circulatory system'],
  },
  mobility: {
    name: 'Mobility',
    muscles: ['Joints', 'Tendons', 'Fascia'],
  },
  fullbody: {
    name: 'Full body',
    muscles: ['All major muscle groups'],
  },
};

export const BODY_ZONES = ZONES.filter((z) => z.body);

export function zoneName(id: ZoneId, lang: Lang = 'es'): string {
  if (lang === 'en') return ZONE_EN[id]?.name ?? 'Other';
  return ZONE_MAP[id]?.name ?? 'Otro';
}

export function zoneNameOf(zone: Zone, lang: Lang = 'es'): string {
  return zoneName(zone.id, lang);
}

export function zoneMuscles(zone: Zone, lang: Lang = 'es'): string[] {
  return lang === 'en' ? ZONE_EN[zone.id]?.muscles ?? zone.muscles : zone.muscles;
}

export function zoneOptions(lang: Lang = 'es'): Array<{ value: string; label: string; hint: string }> {
  return ZONES.map((z) => ({
    value: z.id,
    label: zoneName(z.id, lang),
    hint: zoneMuscles(z, lang).slice(0, 3).join(' · '),
  }));
}

export function typeOptions(lang: Lang = 'es'): Array<{ value: string; label: string; hint: string }> {
  return lang === 'en'
    ? [
        { value: 'fuerza', label: 'Strength', hint: 'Sets, reps and load' },
        { value: 'cardio', label: 'Cardio', hint: 'Duration and heart rate' },
        { value: 'movilidad', label: 'Mobility', hint: 'Range of motion' },
        { value: 'calentamiento', label: 'Warm-up', hint: 'Activation' },
      ]
    : [
        { value: 'fuerza', label: 'Fuerza', hint: 'Series, reps y carga' },
        { value: 'cardio', label: 'Cardio', hint: 'Duración y pulso' },
        { value: 'movilidad', label: 'Movilidad', hint: 'Rango articular' },
        { value: 'calentamiento', label: 'Calentamiento', hint: 'Activación' },
      ];
}

/** Etiqueta del tipo guardado en los datos (`fuerza`, `cardio`...). */
export function exerciseTypeLabel(type: string, lang: Lang = 'es'): string {
  const option = typeOptions(lang).find((item) => item.value === type);
  return option?.label ?? type;
}

export const ZONE_OPTIONS = zoneOptions('es');

export const TYPE_OPTIONS = typeOptions('es');

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

export function zoneColor(id: ZoneId): string {
  return ZONE_MAP[id]?.color ?? '#c77dff';
}
