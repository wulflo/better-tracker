import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauri } from './vault';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

export function canUseUpdater(installFormat?: string): boolean {
  if (!isTauri()) return false;
  // Tauri's Linux updater only supports AppImage. deb/rpm users should use
  // their package manager instead of trying to replace a system package.
  // Windows builds may report a generic or a specific installer format.
  return ['appimage', 'windows', 'msi', 'nsis', 'exe'].includes(installFormat ?? '');
}

export async function checkForUpdate(): Promise<Update | null> {
  if (!isTauri()) throw new Error('La actualización solo está disponible en la app de escritorio.');
  return check({ timeout: 20_000 });
}

export async function installUpdate(
  update: Update,
  onProgress: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? null;
      onProgress(downloaded, total);
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress(downloaded, total);
    } else {
      onProgress(downloaded, total);
    }
  });
  // Windows exits after launching the installer. On Linux we must relaunch
  // to start the newly installed version.
  await relaunch();
}

export function updateSummary(update: Update): UpdateInfo {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date,
    body: update.body,
  };
}
