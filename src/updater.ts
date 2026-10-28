/**
 * Actualizaciones híbridas.
 *
 * - Escritorio: el plugin nativo `updater` verifica la firma minisign y relanza
 *   la app.
 * - Android: GitHub no envía CORS en los assets de release, así que se usa el
 *   plugin HTTP nativo para descargar `latest.json` y la APK. La APK se guarda
 *   en la caché privada, se verifica su SHA-256 y el backend la publica en
 *   Descargas con MediaStore. La instalación es manual, como en SinNotas.
 */
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import type { Update } from '@tauri-apps/plugin-updater';
import { isTauri } from './vault';

export const UPDATE_MANIFEST_URL =
  'https://github.com/wulflo/better-tracker/releases/latest/download/latest.json';
export const ANDROID_UPDATE_PLATFORM_KEY = 'android-aarch64';
const TEMP_APK_FILE_NAME = 'BetterTracker-update.apk';
const MAX_APK_BYTES = 180 * 1024 * 1024;

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

export interface AndroidAsset {
  url: string;
  size?: number;
  sha256: string;
}

export interface AndroidUpdate {
  version: string;
  currentVersion: string;
  asset: AndroidAsset;
}

export type AvailableUpdate =
  | { kind: 'desktop'; update: Update; info: UpdateInfo }
  | { kind: 'android'; update: AndroidUpdate; info: UpdateInfo };

export function canUseUpdater(installFormat?: string): boolean {
  if (!isTauri()) return false;
  // Android se actualiza descargando la APK; en escritorio el plugin nativo
  // solo puede reemplazar AppImage, MSI/NSIS y algunos binarios de Windows.
  // deb/rpm deben actualizarse con el gestor de paquetes del sistema.
  return installFormat === 'apk' || ['appimage', 'windows', 'msi', 'nsis', 'exe'].includes(installFormat ?? '');
}

export async function checkForUpdate(installFormat?: string): Promise<AvailableUpdate | null> {
  if (!isTauri()) {
    throw new Error('La actualización solo está disponible en la app nativa.');
  }
  if (installFormat === 'apk') {
    return checkAndroidUpdate();
  }
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check({ timeout: 20_000 });
  if (!update) return null;
  return { kind: 'desktop', update, info: updateSummary(update) };
}

export async function installUpdate(
  target: AvailableUpdate,
  onProgress: (downloaded: number, total: number | null) => void,
): Promise<{ kind: 'desktop' } | { kind: 'android'; path: string }> {
  if (target.kind === 'desktop') {
    let downloaded = 0;
    let total: number | null = null;
    await target.update.downloadAndInstall((event) => {
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
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
    return { kind: 'desktop' };
  }

  const asset = target.update.asset;
  const { fetch } = await import('@tauri-apps/plugin-http');
  const response = await fetch(asset.url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`La descarga del APK respondió con estado ${response.status}.`);
  }

  const headerSize = Number(response.headers.get('content-length') || 0);
  const expectedSize = asset.size || (Number.isFinite(headerSize) && headerSize > 0 ? headerSize : null);
  if (expectedSize && expectedSize > MAX_APK_BYTES) {
    throw new Error('El APK de actualización es demasiado grande.');
  }

  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  const reader = response.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      downloaded += value.byteLength;
      if (downloaded > MAX_APK_BYTES) {
        throw new Error('El APK de actualización es demasiado grande.');
      }
      onProgress(downloaded, expectedSize);
    }
  } else {
    const buffer = new Uint8Array(await response.arrayBuffer());
    downloaded = buffer.byteLength;
    if (downloaded > MAX_APK_BYTES) {
      throw new Error('El APK de actualización es demasiado grande.');
    }
    chunks.push(buffer);
    onProgress(downloaded, expectedSize);
  }

  const bytes = concatBytes(chunks, downloaded);
  if (asset.size && bytes.byteLength !== asset.size) {
    throw new Error('El APK descargado está incompleto.');
  }

  const digest = await sha256Hex(bytes);
  if (digest !== asset.sha256.toLowerCase()) {
    throw new Error('La firma SHA-256 del APK no coincide con la publicada.');
  }

  const { BaseDirectory, writeFile } = await import('@tauri-apps/plugin-fs');
  await writeFile(TEMP_APK_FILE_NAME, bytes, { baseDir: BaseDirectory.AppCache });
  const path = await invoke<string>('save_android_apk');
  return { kind: 'android', path };
}

export function updateSummary(update: Update): UpdateInfo {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date,
    body: update.body,
  };
}

async function checkAndroidUpdate(): Promise<AvailableUpdate | null> {
  const { fetch } = await import('@tauri-apps/plugin-http');
  const response = await fetch(UPDATE_MANIFEST_URL, {
    method: 'GET',
    headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
  });
  if (!response.ok) {
    throw new Error(`El manifiesto de actualizaciones respondió con estado ${response.status}.`);
  }

  const manifest = (await response.json()) as {
    version?: string;
    notes?: string;
    pub_date?: string;
    platforms?: Record<string, Partial<AndroidAsset>>;
  };
  if (!manifest.version) {
    throw new Error('El manifiesto de actualizaciones no incluye una versión.');
  }

  const currentVersion = await getVersion();
  if (!isNewerVersion(manifest.version, currentVersion)) {
    return null;
  }

  const rawAsset = manifest.platforms?.[ANDROID_UPDATE_PLATFORM_KEY];
  if (!rawAsset?.url || !rawAsset.sha256) {
    throw new Error('La release no incluye una APK de Android para este dispositivo.');
  }
  if (!/^https:\/\//i.test(rawAsset.url)) {
    throw new Error('La URL del APK no usa HTTPS.');
  }
  if (!/^[a-f0-9]{64}$/i.test(rawAsset.sha256)) {
    throw new Error('El manifiesto incluye un SHA-256 no válido.');
  }

  const update: AndroidUpdate = {
    version: manifest.version,
    currentVersion,
    asset: {
      url: rawAsset.url,
      size: typeof rawAsset.size === 'number' ? rawAsset.size : undefined,
      sha256: rawAsset.sha256.toLowerCase(),
    },
  };

  return {
    kind: 'android',
    update,
    info: {
      version: update.version,
      currentVersion,
      date: manifest.pub_date,
      body: manifest.notes,
    },
  };
}

function isNewerVersion(candidate: string, current: string): boolean {
  const parts = (value: string) => {
    const core = value.trim().replace(/^v/i, '').split('-')[0].split('+')[0];
    return core.split('.').map((part) => Number.parseInt(part, 10) || 0);
  };
  const a = parts(candidate);
  const b = parts(current);
  for (let index = 0; index < 3; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
