import { describe, expect, it } from 'vitest';
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
  hip: 100,
  arm: 34,
  thigh: 58,
  calf: 39,
  wrist: 17,
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

  it('nunca proyecta un objetivo fuera del IMC saludable', () => {
    const projection = projectBody(BODY, 'cut', 180);
    expect(projection.available).toBe(true);
    expect(projection.targetWeight).not.toBeNull();
    expect(projection.targetBmi).not.toBeNull();
    expect(projection.targetBmi!).toBeGreaterThanOrEqual(18.5);
    expect(projection.targetBmi!).toBeLessThanOrEqual(24.9);
    expect(projection.milestones).toHaveLength(4);
    expect(projection.milestones.at(-1)!.weight).toBeCloseTo(projection.targetWeight!, 1);
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
