import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './vault';

export const REPOSITORY_URL = 'https://github.com/wulflo/better-tracker';
export const RELEASES_URL = `${REPOSITORY_URL}/releases`;

/**
 * Abre una URL en el navegador del sistema. En modo navegador usa una pestaña
 * nueva; en la app nativa pasa por el comando Rust `open_external`, que solo
 * acepta el repositorio oficial. El webview ya no tiene permiso de `opener`.
 */
export async function openExternal(url: string): Promise<void> {
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Solo se permiten enlaces HTTPS.');
  }
  if (isTauri()) {
    await invoke('open_external', { url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openRepository(): Promise<void> {
  return openExternal(REPOSITORY_URL);
}
