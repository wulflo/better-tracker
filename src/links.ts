import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauri } from './vault';

export const REPOSITORY_URL = 'https://github.com/wulflo/better-tracker';
export const RELEASES_URL = `${REPOSITORY_URL}/releases`;

/**
 * Abre una URL en el navegador del sistema. En modo navegador usa una pestaña
 * nueva; en la app nativa pasa por el plugin opener (incluido Android).
 */
export async function openExternal(url: string): Promise<void> {
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Solo se permiten enlaces HTTPS.');
  }
  if (isTauri()) {
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openRepository(): Promise<void> {
  return openExternal(REPOSITORY_URL);
}
