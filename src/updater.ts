/**
 * Actualizaciones híbridas y verificadas.
 *
 * - AppImage / Windows: el plugin nativo `updater` verifica la firma minisign y
 *   relanza la app. Antes se consulta el manifiesto con Rust y sin caché para
 *   que una release recién publicada se detecte de inmediato.
 * - Linux `.deb` / `.rpm`: el manifiesto incluye el paquete y su SHA-256. Rust
 *   lo descarga en streaming a Descargas, verifica el hash y abre el instalador
 *   del sistema. El plugin nativo no puede reemplazar estos formatos.
 * - Android: Rust descarga la APK, verifica tamaño y SHA-256 y la publica en
 *   Descargas. La instalación sigue siendo manual, como exige Android.
 */
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import type { Update } from '@tauri-apps/plugin-updater';
import { isTauri } from './vault';

export const UPDATE_MANIFEST_URL =
  'https://github.com/wulflo/better-tracker/releases/latest/download/latest.json';
export const ANDROID_UPDATE_PLATFORM_KEY = 'android-aarch64';
export const DEB_UPDATE_PLATFORM_KEY = 'linux-deb-x86_64';
export const RPM_UPDATE_PLATFORM_KEY = 'linux-rpm-x86_64';

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

export interface LinuxPackageUpdate {
  version: string;
  currentVersion: string;
  format: 'deb' | 'rpm';
  asset: AndroidAsset;
}

export type AvailableUpdate =
  | { kind: 'desktop'; update: Update; info: UpdateInfo }
  | { kind: 'package'; update: LinuxPackageUpdate; info: UpdateInfo }
  | { kind: 'android'; update: AndroidUpdate; info: UpdateInfo };

interface ManifestAsset {
  url?: string;
  size?: number;
  sha256?: string;
  signature?: string;
}

interface UpdateManifest {
  version?: string;
  notes?: string;
  pub_date?: string;
  platforms?: Record<string, ManifestAsset>;
}

export function canUseUpdater(installFormat?: string): boolean {
  if (!isTauri()) return false;
  if (installFormat === 'apk') return true;
  // Linux empaquetado (.deb/.rpm) se actualiza con Descargas + instalador del
  // sistema; AppImage y Windows usan el plugin nativo. Un binario portable sin
  // formato detectable no puede reemplazarse solo.
  return [
    'appimage',
    'windows',
    'msi',
    'nsis',
    'exe',
    'deb',
    'rpm',
  ].includes(installFormat ?? '');
}

export function updaterUnavailableReason(installFormat?: string): string {
  if (!isTauri()) return 'La actualización está disponible solo en la app nativa.';
  if (installFormat === 'linux') {
    return 'No se pudo detectar si la app se instaló como .deb o .rpm. Descarga el paquete nuevo desde GitHub Releases.';
  }
  return 'Este formato no admite actualización integrada. Descarga la versión nueva desde GitHub Releases.';
}

export async function checkForUpdate(installFormat?: string): Promise<AvailableUpdate | null> {
  if (!isTauri()) {
    throw new Error('La actualización solo está disponible en la app nativa.');
  }
  if (installFormat === 'apk') {
    return checkAndroidUpdate();
  }
  if (installFormat === 'deb' || installFormat === 'rpm') {
    return checkLinuxPackageUpdate(installFormat);
  }

  const manifest = await fetchManifest();
  const currentVersion = await getVersion();
  if (manifest.version && !isNewerVersion(manifest.version, currentVersion)) {
    return null;
  }

  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check({ timeout: 20_000 });
  if (!update) {
    if (manifest.version && isNewerVersion(manifest.version, currentVersion)) {
      throw new Error(
        `El manifiesto anuncia la versión ${manifest.version}, pero el actualizador nativo no la reconoce para este formato. Vuelve a intentarlo o descarga el paquete desde GitHub Releases.`,
      );
    }
    return null;
  }
  return { kind: 'desktop', update, info: updateSummary(update) };
}

export async function installUpdate(
  target: AvailableUpdate,
  onProgress: (downloaded: number, total: number | null) => void,
): Promise<
  | { kind: 'desktop' }
  | { kind: 'package'; path: string }
  | { kind: 'android'; path: string }
> {
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

  if (target.kind === 'package') {
    const asset = target.update.asset;
    // El comando nativo descarga en streaming, verifica el SHA-256 y abre el
    // instalador. No pasa el paquete por la memoria del webview.
    onProgress(0, asset.size ?? null);
    const path = await invoke<string>('download_and_install_linux_package', {
      url: asset.url,
      sha256: asset.sha256,
      size: asset.size ?? null,
      version: target.update.version,
    });
    onProgress(asset.size ?? 0, asset.size ?? null);
    return { kind: 'package', path };
  }

  const asset = target.update.asset;
  onProgress(0, asset.size ?? null);
  const path = await invoke<string>('download_android_apk', {
    url: asset.url,
    sha256: asset.sha256,
    size: asset.size ?? null,
    version: target.update.version,
  });
  onProgress(asset.size ?? 0, asset.size ?? null);
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

async function fetchManifest(): Promise<UpdateManifest> {
  const manifest = await invoke<UpdateManifest>('fetch_update_manifest');
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('El manifiesto de actualizaciones está vacío.');
  }
  return manifest;
}

function validateAsset(rawAsset: ManifestAsset | undefined, label: string): AndroidAsset {
  if (!rawAsset?.url || !rawAsset.sha256) {
    throw new Error(`La release no incluye ${label} para este dispositivo.`);
  }
  if (!/^https:\/\//i.test(rawAsset.url)) {
    throw new Error(`La URL de ${label} no usa HTTPS.`);
  }
  if (!rawAsset.url.startsWith('https://github.com/wulflo/better-tracker/releases/')) {
    throw new Error(`La URL de ${label} no pertenece a las releases oficiales.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(rawAsset.sha256)) {
    throw new Error(`El manifiesto incluye un SHA-256 no válido para ${label}.`);
  }
  return {
    url: rawAsset.url,
    size: typeof rawAsset.size === 'number' && rawAsset.size > 0 ? rawAsset.size : undefined,
    sha256: rawAsset.sha256.toLowerCase(),
  };
}

async function checkAndroidUpdate(): Promise<AvailableUpdate | null> {
  const manifest = await fetchManifest();
  if (!manifest.version) {
    throw new Error('El manifiesto de actualizaciones no incluye una versión.');
  }
  const currentVersion = await getVersion();
  if (!isNewerVersion(manifest.version, currentVersion)) {
    return null;
  }
  const asset = validateAsset(
    manifest.platforms?.[ANDROID_UPDATE_PLATFORM_KEY],
    'una APK de Android',
  );
  const update: AndroidUpdate = { version: manifest.version, currentVersion, asset };
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

async function checkLinuxPackageUpdate(format: 'deb' | 'rpm'): Promise<AvailableUpdate | null> {
  const manifest = await fetchManifest();
  if (!manifest.version) {
    throw new Error('El manifiesto de actualizaciones no incluye una versión.');
  }
  const currentVersion = await getVersion();
  if (!isNewerVersion(manifest.version, currentVersion)) {
    return null;
  }
  const key = format === 'deb' ? DEB_UPDATE_PLATFORM_KEY : RPM_UPDATE_PLATFORM_KEY;
  const asset = validateAsset(manifest.platforms?.[key], `un paquete .${format}`);
  const update: LinuxPackageUpdate = { version: manifest.version, currentVersion, format, asset };
  return {
    kind: 'package',
    update,
    info: {
      version: update.version,
      currentVersion,
      date: manifest.pub_date,
      body: manifest.notes,
    },
  };
}

export function isNewerVersion(candidate: string, current: string): boolean {
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
