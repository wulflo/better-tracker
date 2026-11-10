import { describe, expect, it } from 'vitest';
import type { BodyComposition } from './metrics';
import type { BodyMeasures } from './types';
import { classifyValue, projectBody, safeBmiRange, safeBodyFatRange } from './bodyRange';

const BODY: BodyMeasures = {
  sex: 'male',
  age: 30,
  weight: 90,
  height: 180,
  neck: 39,
  chest: 104,
  waist: 92,
  abdomen: 95,
  hip: 100,
  arm: 34,
  forearm: 27,
  thigh: 58,
  calf: 39,
  wrist: 17,
};

const MUSCULAR: BodyComposition = {
  methods: [],
  avg: 16,
  min: 16,
  max: 16,
  bmi: 27.78,
  fatMass: 14.4,
  leanMass: 75.6,
  whr: null,
  whtr: null,
  bmrMifflin: null,
  bmrKatch: null,
  bmrCunningham: null,
  tdee: null,
  missing: [],
  used: [],
  confidence: 80,
  coverage: 80,
};

describe('rangos corporales seguros', () => {
  it('usa el rango de IMC de la OMS en adultos', () => {
    expect(safeBmiRange(30)).toMatchObject({ min: 18.5, max: 24.9 });
    expect(safeBmiRange(70)).toMatchObject({ min: 22, max: 27 });
  });

  it('adapta el porcentaje de grasa por sexo y edad', () => {
    expect(safeBodyFatRange('male', 30)).toMatchObject({ min: 8, max: 19 });
    expect(safeBodyFatRange('female', 45)).toMatchObject({ min: 23, max: 34 });
    expect(safeBodyFatRange('unspecified', 30)).toBeNull();
  });

  it('clasifica valores por debajo, dentro y por encima', () => {
    const range = safeBmiRange(30);
    expect(classifyValue(17, range).status).toBe('low');
    expect(classifyValue(22, range).status).toBe('safe');
    expect(classifyValue(31, range).status).toBe('high');
    expect(classifyValue(null, range).status).toBe('unknown');
  });

  it('recalcula el objetivo desde la composición y no lo limita al IMC', () => {
    const projection = projectBody(BODY, 'cut', 180, 'moderate', MUSCULAR, 'es', 12);
    expect(projection.available).toBe(true);
    expect(projection.targetSource).toBe('composition');
    expect(projection.targetWeight).not.toBeNull();
    expect(projection.targetFatMass).not.toBeNull();
    expect(projection.targetLeanMass).not.toBeNull();
    expect(projection.targetLeanMass!).toBeCloseTo(75.6, 1);
    expect(projection.targetFatMass!).toBeCloseTo(10.3, 1);
    expect(projection.targetWeight!).toBeCloseTo(85.9, 1);
    expect(projection.targetBmi!).toBeGreaterThan(24.9);
    expect(projection.note).toContain('masa magra');
    expect(projection.milestones).toHaveLength(4);
    expect(projection.milestones.at(-1)!.weight).toBeCloseTo(projection.targetWeight!, 1);
    expect(projection.milestones.at(-1)!.fatMass).toBeCloseTo(projection.targetFatMass!, 1);
  });

  it('usa la fuerza mensual para conservar masa magra y ajustar el ritmo', () => {
    const trained = projectBody(BODY, 'cut', 180, 'moderate', MUSCULAR, 'es', 12);
    const untrained = projectBody(BODY, 'cut', 180, 'moderate', MUSCULAR, 'es', 0);
    expect(trained.targetLeanMass!).toBeGreaterThan(untrained.targetLeanMass!);
    expect(trained.targetWeight!).toBeGreaterThan(untrained.targetWeight!);
    expect(trained.weeks!).toBeLessThan(untrained.weeks!);
    expect(trained.strengthPerMonth).toBe(12);
    expect(untrained.note).toContain('pérdida de masa magra');
  });

  it('usa los pasos medios para ajustar el gasto y las fechas futuras', () => {
    const low = projectBody(BODY, 'cut', 0, 'sedentary', MUSCULAR, 'es', 12, 3000);
    const high = projectBody(BODY, 'cut', 0, 'sedentary', MUSCULAR, 'es', 12, 12000);
    expect(high.weeks!).toBeLessThan(low.weeks!);
    expect(high.dailyKcalDelta).toBeLessThan(low.dailyKcalDelta);
    expect(high.note).toContain('12000 pasos/día');
    expect(high.milestones.at(-1)!.date < low.milestones.at(-1)!.date).toBe(true);
  });

  it('sin composición usa el IMC como respaldo y lo limita al rango', () => {
    const projection = projectBody(
      { ...BODY, sex: 'unspecified', neck: 0, waist: 0, abdomen: 0, hip: 0, arm: 0, forearm: 0, thigh: 0, wrist: 0 },
      'cut',
      180,
    );
    expect(projection.targetSource).toBe('bmi');
    expect(projection.targetBmi).not.toBeNull();
    expect(projection.targetBmi!).toBeGreaterThanOrEqual(18.5);
    expect(projection.targetBmi!).toBeLessThanOrEqual(24.9);
    expect(projection.note).toContain('solo con el IMC');
  });

  it('no proyecta una pérdida que en realidad suba de peso', () => {
    const projection = projectBody({ ...BODY, weight: 70, waist: 95, neck: 38 }, 'cut', 180);
    expect(projection.targetWeight).not.toBeNull();
    expect(projection.targetWeight!).toBeLessThanOrEqual(70);
  });

  it('marca como inseguro seguir perdiendo con IMC bajo', () => {
    const projection = projectBody({ ...BODY, weight: 58 }, 'cut', 180);
    expect(projection.safe).toBe(false);
    expect(projection.message).toContain('límite bajo');
  });

  it('mantiene avisos y mensajes cuando faltan datos', () => {
    const projection = projectBody({ ...BODY, weight: 0 }, 'maintain', 0);
    expect(projection.available).toBe(false);
    expect(projection.targetWeight).toBeNull();
    expect(projection.milestones).toEqual([]);
  });

  it('en mantenimiento no inventa una fecha de llegada', () => {
    const projection = projectBody(BODY, 'maintain', 180, 'moderate');
    expect(projection.available).toBe(true);
    expect(projection.weeks).toBe(0);
    expect(projection.etaDate).toBeNull();
    expect(projection.message).toContain('mantienes el peso');
  });
});
