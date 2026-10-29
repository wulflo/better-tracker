/**
 * Catálogo local de códigos de barras de Argentina, Perú y México.
 *
 * Se genera con `node scripts/generate-barcode-catalog.mjs` a partir del export
 * mini de Open Food Facts. Solo contiene código, nombre y categoría; los macros
 * se aproximan por categoría y se marcan como estimación. El catálogo se carga
 * de forma diferida la primera vez que se escanea un código, así no pesa en el
 * arranque de la app ni en el primer render del Panel.
 *
 * Orden de búsqueda recomendado:
 *   1. Alimentos ya guardados en la bóveda (`findFoodByBarcode`).
 *   2. Este catálogo local (funciona sin conexión).
 *   3. Open Food Facts (datos exactos si hay red).
 */
import type { Food, FoodCategory, FoodPer100 } from './types';
import { barcodeVariants, normalizeBarcode } from './foodDb';
import meta from './data/barcodeCatalogMeta.json';

type CatalogRow = [code: string, name: string, category: FoodCategory, country: 'AR' | 'PE' | 'MX'];

interface CatalogMeta {
  generatedAt: string;
  total: number;
  counts: Record<string, number>;
  templates: Record<string, [number, number, number, number, number]>;
}

const META = meta as unknown as CatalogMeta;
const TEMPLATES = META.templates as Record<FoodCategory | 'otro', [number, number, number, number, number]>;

let cache: Map<string, CatalogRow> | null = null;
let loading: Promise<Map<string, CatalogRow>> | null = null;

export async function loadBarcodeCatalog(): Promise<Map<string, CatalogRow>> {
  if (cache) return cache;
  if (loading) return loading;
  loading = import('./data/barcodeCatalog.json')
    .then((module) => {
      const rows = module.default as CatalogRow[];
      cache = new Map(rows.map((row) => [row[0], row]));
      return cache;
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

export function catalogMeta(): CatalogMeta {
  return META;
}

function estimatedPer100(category: FoodCategory): FoodPer100 {
  const template = TEMPLATES[category] ?? TEMPLATES.otro;
  return {
    kcal: template[0],
    protein: template[1],
    carbs: template[2],
    fat: template[3],
    fiber: template[4],
  };
}

function countryLabel(country: string): string {
  return country === 'AR' ? 'Argentina' : country === 'PE' ? 'Perú' : 'México';
}

/**
 * Devuelve un alimento aproximado si el código está en el catálogo local.
 * Se prueban las mismas variantes EAN/UPC/GTIN que usa el resto de la app.
 */
export async function lookupBarcodeCatalog(rawCode: string): Promise<Food | null> {
  const normalized = normalizeBarcode(rawCode);
  if (!normalized) return null;
  let catalog: Map<string, CatalogRow>;
  try {
    catalog = await loadBarcodeCatalog();
  } catch {
    return null;
  }
  for (const candidate of barcodeVariants(normalized)) {
    const row = catalog.get(candidate);
    if (!row) continue;
    const [, name, category, country] = row;
    const per100 = estimatedPer100(category);
    return {
      id: `local-${row[0]}`,
      name,
      category,
      per100,
      units: {},
      custom: true,
      barcode: row[0],
      source: `catálogo local ${countryLabel(country)} · macros estimados`,
      quantityLabel: null,
      servingLabel: null,
    };
  }
  return null;
}

/** Solo para tests y para el panel de ajustes. */
export function resetBarcodeCatalogCache(): void {
  cache = null;
  loading = null;
}
