import { describe, expect, it } from 'vitest';
import type { Food, FoodLogItem, VaultEvent } from './types';
import {
  FOODS,
  barcodeVariants,
  calcFood,
  findFoodByBarcode,
  foodUnits,
  isGtinLength,
  mealGrams,
  mealTotals,
  reduceCustomFoods,
  resizeFoodLogItem,
  searchFoods,
  validBarcodeChecksum,
} from './foodDb';

function event(kind: string, payload: Record<string, unknown>, timestamp = '2026-01-01T00:00:00.000Z'): VaultEvent {
  return { id: `${kind}-${timestamp}`, device_id: 'test', timestamp, kind, payload };
}

describe('food database', () => {
  it('bundles hundreds of common foods with gram and portion units', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(180);
    const chicken = FOODS.find((food) => food.id === 'pollo_pechuga');
    expect(chicken).toBeTruthy();
    expect(foodUnits(chicken as Food)).toContain('g');
    expect(foodUnits(chicken as Food)).toContain('filete');
    expect(FOODS.every((food) => food.name && food.per100.kcal >= 0)).toBe(true);
  });

  it('calculates grams and macros dynamically for different measures', () => {
    const chicken = FOODS.find((food) => food.id === 'pollo_pechuga') as Food;
    const grams = calcFood(chicken, 150, 'g');
    expect(grams.grams).toBe(150);
    expect(grams.kcal).toBe(248);
    expect(grams.protein).toBe(46.5);

    const fillet = calcFood(chicken, 1, 'filete');
    expect(fillet.grams).toBe(120);
    expect(fillet.kcal).toBe(198);
    expect(fillet.protein).toBe(37.2);

    const oil = FOODS.find((food) => food.id === 'aceite_oliva') as Food;
    expect(calcFood(oil, 1, 'cucharada').grams).toBe(14);
  });

  it('totals the daily meal draft', () => {
    const items: FoodLogItem[] = [
      {
        id: 'a', foodId: 'pollo_pechuga', name: 'Pollo', category: 'carne', meal: 'comida',
        quantity: 150, unit: 'g', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0,
      },
      {
        id: 'b', foodId: 'arroz_blanco', name: 'Arroz', category: 'cereal', meal: 'comida',
        quantity: 1, unit: 'taza', grams: 158, kcal: 205, protein: 4.3, carbs: 44.6, fat: 0.5, fiber: 0.6,
      },
    ];
    expect(mealTotals(items)).toEqual({
      kcal: 453,
      protein: 50.8,
      carbs: 44.6,
      fat: 5.9,
      fiber: 0.6,
    });
  });

  it('keeps custom foods from the latest saved event', () => {
    const base: Food = {
      id: 'custom-1', name: 'Tortilla casera', category: 'otro',
      per100: { kcal: 200, protein: 10, carbs: 20, fat: 9, fiber: 1 }, units: {},
    };
    const changed: Food = { ...base, name: 'Tortilla de casa', per100: { ...base.per100, kcal: 210 } };
    const foods = reduceCustomFoods([
      event('food.saved', base as unknown as Record<string, unknown>),
      event('food.saved', changed as unknown as Record<string, unknown>, '2026-01-02T00:00:00.000Z'),
    ]);
    expect(foods).toHaveLength(1);
    expect(foods[0].name).toBe('Tortilla de casa');
    expect(foods[0].per100.kcal).toBe(210);
    expect(foods[0].custom).toBe(true);
  });

  it('searches names without accents being mandatory', () => {
    const results = searchFoods(FOODS, 'platano');
    expect(results.some((food) => food.id === 'platano')).toBe(true);
  });

  it('builds the same UPC/EAN/GTIN variants as the native lookup', () => {
    const upc = barcodeVariants('012345678905');
    expect(upc).toContain('012345678905');
    expect(upc).toContain('12345678905');
    expect(upc).toContain('0012345678905');
    expect(barcodeVariants('8412345678905')).toContain('08412345678905');
    expect(barcodeVariants('123')).toEqual([]);
    expect(barcodeVariants('no-es-un-codigo')).toEqual([]);
  });

  it('finds products by barcode across UPC/EAN zero padding', () => {
    const product: Food = {
      id: 'off-8412345678905',
      name: 'Producto escaneado',
      category: 'procesado',
      per100: { kcal: 200, protein: 10, carbs: 20, fat: 8, fiber: 2 },
      units: {},
      custom: true,
      barcode: '8412345678905',
      source: 'openfoodfacts',
    };
    expect(findFoodByBarcode([product], '8412345678905')?.id).toBe(product.id);

    const upc: Food = { ...product, id: 'upc', barcode: '012345678905' };
    expect(findFoodByBarcode([upc], '12345678905')?.id).toBe('upc');
    expect(findFoodByBarcode([upc], '00012345678905')?.id).toBe('upc');
    expect(findFoodByBarcode([upc], '9999999999999')).toBeNull();
  });

  it('recalculates an added item when its quantity or unit changes', () => {
    const chicken = FOODS.find((food) => food.id === 'pollo_pechuga') as Food;
    const item: FoodLogItem = {
      id: 'a', foodId: 'pollo_pechuga', name: 'Pollo', category: 'carne', meal: 'comida',
      quantity: 150, unit: 'g', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0,
    };
    const bigger = resizeFoodLogItem(item, chicken, 200, 'g', 'cena');
    expect(bigger.meal).toBe('cena');
    expect(bigger.quantity).toBe(200);
    expect(bigger.grams).toBe(200);
    expect(bigger.kcal).toBe(330);
    expect(bigger.protein).toBe(62);

    const fillet = resizeFoodLogItem(item, chicken, 1, 'filete');
    expect(fillet.grams).toBe(120);
    expect(fillet.kcal).toBe(198);

    const unknown = resizeFoodLogItem(item, undefined, 300, 'g');
    expect(unknown.grams).toBe(300);
    expect(unknown.kcal).toBe(496);
  });

  it('sums the weight of the day food', () => {
    const items: FoodLogItem[] = [
      {
        id: 'a', foodId: 'pollo_pechuga', name: 'Pollo', category: 'carne', meal: 'comida',
        quantity: 150, unit: 'g', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0,
      },
      {
        id: 'b', foodId: 'arroz_blanco', name: 'Arroz', category: 'cereal', meal: 'comida',
        quantity: 1, unit: 'taza', grams: 158, kcal: 205, protein: 4.3, carbs: 44.6, fat: 0.5, fiber: 0.6,
      },
    ];
    expect(mealGrams(items)).toBe(308);
  });
});

describe('checksum GTIN (mod 10) de códigos de barras', () => {
  it('valida códigos reales de cada formato estándar', () => {
    expect(validBarcodeChecksum('4006381333931')).toBe(true); // EAN-13 (ejemplo de GS1)
    expect(validBarcodeChecksum('73513537')).toBe(true); // EAN-8
    expect(validBarcodeChecksum('036000291452')).toBe(true); // UPC-A de 12 dígitos
  });

  it('rechaza dígitos de control o códigos mal tecleados', () => {
    expect(validBarcodeChecksum('4006381333932')).toBe(false); // check alternado
    expect(validBarcodeChecksum('036000291453')).toBe(false); // +1 en el último
    expect(validBarcodeChecksum('73513538')).toBe(false);
    // Dígitos transpuestos fallan el mod 10: el modo típico de teclear mal.
    expect(validBarcodeChecksum('4006381339331')).toBe(false);
    // Formas no estándar: cortas o vacías no pasan la puerta.
    expect(validBarcodeChecksum('')).toBe(false);
    expect(validBarcodeChecksum('7')).toBe(false);
  });

  it('es estable ante el relleno de ceros y la presentación', () => {
    // UPC-A → EAN-13 → GTIN-14: ceros a la izquierda no cambian el resultado.
    expect(validBarcodeChecksum('0036000291452')).toBe(true);
    expect(validBarcodeChecksum('00036000291452')).toBe(true);
    // Espacios y guiones se limpian antes de validar.
    expect(validBarcodeChecksum('4006 3813 33931')).toBe(true);
    expect(validBarcodeChecksum('735135-37')).toBe(true);
    // Sin relleno y sin dígito completo, obviamente no cierra.
    expect(validBarcodeChecksum('03600029145')).toBe(false);
  });

  it('solo aplica la puerta a longitudes GTIN estándar', () => {
    expect(isGtinLength('4006381333931')).toBe(true); // 13
    expect(isGtinLength('036000291452')).toBe(true); // 12
    expect(isGtinLength('73513537')).toBe(true); // 8
    // Code 128 interno u otras longitudes: no se exige checksum y no hay aviso.
    expect(isGtinLength('1234567')).toBe(false);
    expect(isGtinLength('12345')).toBe(false);
  });

  it('valida códigos reales del export de Open Food Facts', async () => {
    // El catálogo viene de OFF; el ~97 % pasa el mod 10 y el resto son
    // códigos internos o erratas del export, que en la UI avisan y permiten
    // «Buscar igual».
    const rows = (await import('./data/barcodeCatalog.json')).default as string[][];
    const codes = rows.map((row) => row[0]);
    const valid = codes.filter((code) => validBarcodeChecksum(code)).length;
    expect(valid / codes.length).toBeGreaterThan(0.9);
    // Un producto real del catálogo queda runnable sin el aviso.
    expect(validBarcodeChecksum('1000000040258')).toBe(true);
  });
});
