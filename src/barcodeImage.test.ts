import { describe, expect, it } from 'vitest';
import {
  BARCODE_IMAGE_ACCEPT,
  MAX_BARCODE_IMAGE_BYTES,
  barcodeImageTypeFromName,
  validateBarcodeImage,
} from './barcodeImage';

describe('validateBarcodeImage', () => {
  it('acepta imágenes rasterizadas de tipo declarado', () => {
    expect(validateBarcodeImage({ type: 'image/png', size: 1024 })).toBeNull();
    expect(validateBarcodeImage({ type: 'image/jpeg', size: 0.5 * MAX_BARCODE_IMAGE_BYTES })).toBeNull();
    expect(validateBarcodeImage({ type: 'image/webp', size: 1 })).toBeNull();
  });

  it('deduce el tipo por extensión cuando el MIME no llega', () => {
    expect(validateBarcodeImage({ name: 'envase.JPG', size: 2048 })).toBeNull();
    expect(validateBarcodeImage({ name: 'codigo.png', size: 2048 })).toBeNull();
    expect(validateBarcodeImage({ name: 'extraño.webp', size: 2048 })).toBeNull();
  });

  it('rechaza SVG y tipos desconocidos', () => {
    expect(validateBarcodeImage({ type: 'image/svg+xml', size: 1024 })).not.toBeNull();
    expect(validateBarcodeImage({ type: 'application/pdf', size: 1024 })).not.toBeNull();
    expect(validateBarcodeImage({ name: 'trampa.svg', size: 1024 })).not.toBeNull();
    expect(validateBarcodeImage({ name: 'sin.extension', size: 1024 })).not.toBeNull();
  });

  it('rechaza archivos vacíos y demasiado grandes', () => {
    expect(validateBarcodeImage({ type: 'image/png', size: 0 })).not.toBeNull();
    expect(validateBarcodeImage({ type: 'image/png', size: MAX_BARCODE_IMAGE_BYTES + 1 })).not.toBeNull();
    expect(validateBarcodeImage({ type: 'image/png', size: MAX_BARCODE_IMAGE_BYTES })).toBeNull();
  });

  it('rechaza entradas nulas', () => {
    expect(validateBarcodeImage(null as unknown as { type?: null })).not.toBeNull();
  });
});

describe('barcodeImageTypeFromName', () => {
  it('mapea extensiones comunes', () => {
    expect(barcodeImageTypeFromName('a.jpg')).toBe('image/jpeg');
    expect(barcodeImageTypeFromName('a.bmp')).toBe('image/bmp');
    expect(barcodeImageTypeFromName('a.heic')).toBeNull();
    expect(barcodeImageTypeFromName(undefined)).toBeNull();
  });
});

describe('BARCODE_IMAGE_ACCEPT', () => {
  it('no permite SVG en el input de archivos', () => {
    expect(BARCODE_IMAGE_ACCEPT).not.toContain('svg');
  });
});
