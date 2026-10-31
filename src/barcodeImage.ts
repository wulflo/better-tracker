/**
 * Validación de imágenes para decodificar un código de barras sin usar la
 * cámara (escritorio). Todo el procesamiento es local: el archivo nunca sale
 * del equipo, se convierte en data URL dentro del propio WebView y se pasa al
 * decodificador ZXing en memoria.
 *
 * Reglas de seguridad:
 * - Lista cerrada de tipos MIME de imagen rasterizada. Se excluyen SVG y
 *   cualquier tipo no reconocido: un SVG puede incrustar scripts y el WebView
 *   los ejecutaría si se renderiza la imagen en el DOM.
 * - Tamaño máximo acotado para no colgar el decodificador con archivos
 *   enormes (el límite iguala el de los catálogos que se podrían fotografiar
 *   con holgura).
 */
export const MAX_BARCODE_IMAGE_BYTES = 10 * 1024 * 1024;

/** Tipos MIME permitidos; sin SVG ni tipos desconocidos. */
export const BARCODE_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/bmp',
] as const;

/** value para el atributo `accept` del input de archivos. */
export const BARCODE_IMAGE_ACCEPT = BARCODE_IMAGE_TYPES.join(',');

/** `type` calculado desde el nombre si el sistema no informo el MIME. */
export function barcodeImageTypeFromName(name: string | undefined | null): string | null {
  const extension = name?.split('.').pop()?.toLowerCase() ?? '';
  switch (extension) {
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'avif': return 'image/avif';
    case 'gif': return 'image/gif';
    case 'bmp': return 'image/bmp';
    default: return null;
  }
}

/**
 * Devuelve el mensaje de error si el archivo no es apto, o `null` si pasa.
 * Solo mira metadatos (tipo MIME y tamaño); no lee el contenido.
 */
export function validateBarcodeImage(file: {
  type?: string | null;
  size?: number | null;
  name?: string | null;
}): string | null {
  if (!file) return 'No se seleccionó ninguna imagen.';
  const type = (file.type || barcodeImageTypeFromName(file.name) || '').toLowerCase();
  if (!BARCODE_IMAGE_TYPES.includes(type as (typeof BARCODE_IMAGE_TYPES)[number])) {
    return 'La imagen debe ser PNG, JPG, WebP, AVIF, GIF o BMP.';
  }
  if (typeof file.size === 'number') {
    if (file.size <= 0) return 'El archivo está vacío.';
    if (file.size > MAX_BARCODE_IMAGE_BYTES) return 'La imagen supera los 10 MB permitidos.';
  }
  return null;
}

/** Lee el archivo como data URL local (no toca la red). */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen del equipo.'));
    reader.readAsDataURL(file);
  });
}
