import { describe, expect, it } from 'vitest';
import { catalogMeta, lookupBarcodeCatalog, resetBarcodeCatalogCache } from './barcodeCatalog';

describe('catálogo local de códigos de barras', () => {
  it('carga un catálogo con códigos de Argentina, Perú y México', () => {
    const meta = catalogMeta();
    expect(meta.total).toBeGreaterThan(1000);
    expect(meta.counts.AR).toBeGreaterThan(100);
    expect(meta.counts.PE).toBeGreaterThan(100);
    expect(meta.counts.MX).toBeGreaterThan(100);
  });

  it('encuentra un código argentino sin conexión y marca los macros como estimados', async () => {
    resetBarcodeCatalogCache();
    const food = await lookupBarcodeCatalog('1000000040258');
    expect(food).not.toBeNull();
    expect(food?.barcode).toBe('1000000040258');
    expect(food?.source).toContain('Argentina');
    expect(food?.source).toContain('estimados');
    expect(food?.per100.kcal).toBeGreaterThanOrEqual(0);
  });

  it('acepta variantes GTIN-14 con ceros a la izquierda', async () => {
    const food = await lookupBarcodeCatalog('01000000040258');
    expect(food?.barcode).toBe('1000000040258');
  });

  it('devuelve null para códigos desconocidos o inválidos', async () => {
    expect(await lookupBarcodeCatalog('9999999999999')).toBeNull();
    expect(await lookupBarcodeCatalog('abc')).toBeNull();
  });
});
