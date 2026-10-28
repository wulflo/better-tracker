export type Sex = 'male' | 'female' | 'unspecified';
export type GoalMode = 'cut' | 'maintain' | 'bulk';

export type FoodCategory =
  | 'fruta'
  | 'verdura'
  | 'cereal'
  | 'legumbre'
  | 'carne'
  | 'pescado'
  | 'huevo'
  | 'lacteo'
  | 'fruto_seco'
  | 'grasa'
  | 'bebida'
  | 'condimento'
  | 'dulce'
  | 'procesado'
  | 'suplemento'
  | 'otro';

export type MealSlot = 'desayuno' | 'comida' | 'cena' | 'snack';

export interface FoodPer100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Food {
  id: string;
  name: string;
  category: FoodCategory;
  per100: FoodPer100;
  /** Gramos que pesa una unidad de cada medida (g/ml se manejan aparte). */
  units: Record<string, number>;
  custom?: boolean;
  /** EAN-8/EAN-13/UPC-A/UPC-E que identifica el producto en el envase. */
  barcode?: string;
  /** Origen de los datos: openfoodfacts, manual, etc. */
  source?: string;
  /** Contenido del envase según el fabricante (ej. "500 g"). */
  quantityLabel?: string | null;
  /** Tamaño de la ración indicada por el fabricante (ej. "30 g"). */
  servingLabel?: string | null;
}

export interface BarcodeProduct extends Food {
  barcode: string;
  source: string;
}

export interface FoodLogItem {
  id: string;
  foodId: string;
  name: string;
  category: FoodCategory;
  meal: MealSlot;
  quantity: number;
  unit: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Exercise {
  id: string;
  name: string;
  zone?: string;
  muscle?: string;
  type: string;
}

export interface SetEntry {
  reps: number;
  weight: number;
  rpe?: number;
}

export interface WorkoutEntry {
  exerciseId: string;
  sets: SetEntry[];
}

export interface Workout {
  id: string;
  date: string;
  name: string;
  entries: WorkoutEntry[];
}

export interface Session {
  id: string;
  date: string;
  routineId?: string | null;
  duration: number;
  entries: WorkoutEntry[];
  rpeSession?: number;
}

export interface RoutineExercise {
  exerciseId: string;
  sets: number;
  reps: number;
  load: number;
  rest: number;
}

export interface Routine {
  id: string;
  name: string;
  exercises: RoutineExercise[];
}

export interface Plan {
  id: string;
  routineId: string;
  days: number[];
  startTime: string;
  duration: number;
}

export interface Mesocycle {
  id: string;
  name: string;
  weeks: number;
  deload: boolean;
  start: string;
}

export interface Reminder {
  id: string;
  title: string;
  time: string;
  days: number[];
  enabled: boolean;
}

export interface WeightEntry {
  date: string;
  kg: number;
}

export interface NutritionEntry {
  date: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  water: number;
}

export interface Goal {
  id: string;
  type: string;
  target: number;
  date: string;
  note: string;
}

export interface BodyMeasures {
  sex: Sex;
  age: number;
  weight: number;
  height: number;
  neck: number;
  chest: number;
  waist: number;
  hip: number;
  arm: number;
  thigh: number;
  calf: number;
  wrist: number;
}

export interface MeasurementEntry extends BodyMeasures {
  date: string;
}

export interface PR {
  exerciseId: string;
  name: string;
  weight: number;
  reps: number;
  date: string;
}

export interface AppInfo {
  version: string;
  commit: string;
  build_date: string;
  vault_schema_version: number;
  install_format: string;
}

export interface VaultEvent {
  id: string;
  device_id: string;
  timestamp: string;
  kind: string;
  payload: any;
}

export const EMPTY_MEASURES: BodyMeasures = {
  sex: 'unspecified',
  age: 0,
  weight: 0,
  height: 0,
  neck: 0,
  chest: 0,
  waist: 0,
  hip: 0,
  arm: 0,
  thigh: 0,
  calf: 0,
  wrist: 0,
};
