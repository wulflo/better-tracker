/**
 * Tauri rechaza comandos con objetos (`{ message, code, data }`) que `String()`
 * convierte en `[object Object]`. Este helper conserva el mensaje real para que
 * los avisos de cámara, permisos y bóveda sean útiles.
 */
export function errorText(error: unknown): string {
  if (error == null) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || error.name || String(error);

  if (typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const message = value.message ?? value.error ?? value.reason;
    if (typeof message === 'string' && message.trim()) {
      const code = value.code;
      return code != null && String(code).trim()
        ? `${message} (código ${String(code)})`
        : message;
    }
    const data = value.data;
    if (data != null) {
      try {
        return typeof data === 'string' ? data : JSON.stringify(data);
      } catch {
        // sigue con el fallback
      }
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return json;
    } catch {
      // sigue con el fallback
    }
  }

  return String(error);
}
