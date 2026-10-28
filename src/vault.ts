import { invoke } from '@tauri-apps/api/core';
import pkg from '../package.json';
import { barcodeVariants } from './foodDb';
import type { AppInfo, BarcodeProduct, FoodCategory, VaultEvent } from './types';

export type { VaultEvent };

const MOCK = '__better_tracker_mock__';
const MOCK_VAULT_KEY = 'bt.mock.vault';
const MOCK_DEVICE_KEY = 'bt.mock.device';
const MOCK_EVENTS_KEY = 'bt.mock.events';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function mockDeviceId(): string {
  let id = localStorage.getItem(MOCK_DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(MOCK_DEVICE_KEY, id);
  }
  return id;
}

function mockEvents(): VaultEvent[] {
  const raw = localStorage.getItem(MOCK_EVENTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as VaultEvent[];
  } catch {
    return [];
  }
}

function saveMockEvents(events: VaultEvent[]): void {
  localStorage.setItem(MOCK_EVENTS_KEY, JSON.stringify(events));
}

export interface VaultInfo {
  path: string | null;
  label: string | null;
  data_dir: string | null;
}

export interface VaultSelection {
  path: string;
  label: string;
}

export interface SnapshotInfo {
  /** `<fecha>` para copias antiguas o `<dispositivo>/<fecha>` en las nuevas. */
  id: string;
  date: string;
  device_id: string;
  device_label: string;
  files: number;
  bytes: number;
  complete: boolean;
  legacy: boolean;
  current_device: boolean;
}

export interface BackupStatus {
  retention_days: number;
  last_backup: string | null;
  copies: SnapshotInfo[];
  total_bytes: number;
}

export interface BackupRunResult {
  created: boolean;
  skipped: string | null;
  date: string | null;
  status: BackupStatus;
}

export interface RestoreResult {
  imported: number;
  already_present: number;
  source_events: number;
  folder: string;
}

export async function getVaultInfo(): Promise<VaultInfo> {
  if (!isTauri()) {
    const path = localStorage.getItem(MOCK_VAULT_KEY);
    return { path, label: path, data_dir: path ? `${path}/omega` : null };
  }
  return invoke<VaultInfo>('get_vault_info');
}

export async function getVaultPath(): Promise<string | null> {
  if (!isTauri()) return localStorage.getItem(MOCK_VAULT_KEY);
  return invoke<string | null>('get_vault_path');
}

export async function selectVault(): Promise<VaultSelection> {
  if (!isTauri()) {
    const path = localStorage.getItem(MOCK_VAULT_KEY) || 'Bóveda local (modo navegador)';
    localStorage.setItem(MOCK_VAULT_KEY, path);
    return { path, label: 'Bóveda local (modo navegador)' };
  }
  return invoke<VaultSelection>('select_vault');
}

function emptyBackupStatus(): BackupStatus {
  return {
    retention_days: 7,
    last_backup: null,
    copies: [],
    total_bytes: 0,
  };
}

export async function getBackupStatus(): Promise<BackupStatus> {
  if (!isTauri()) return emptyBackupStatus();
  return invoke<BackupStatus>('vault_backup_status');
}

export async function runBackup(force = false): Promise<BackupRunResult> {
  if (!isTauri()) {
    return {
      created: false,
      skipped: 'Las copias Longlife solo están disponibles en la app nativa.',
      date: null,
      status: emptyBackupStatus(),
    };
  }
  return invoke<BackupRunResult>('vault_run_backup', { force });
}

export async function deleteBackups(): Promise<BackupStatus> {
  if (!isTauri()) return emptyBackupStatus();
  return invoke<BackupStatus>('vault_delete_backups');
}

/**
 * Importa a la bóveda actual los eventos de una copia Longlife que ya no estén
 * presentes. Nunca sobrescribe ni borra eventos: los recuperados se escriben en
 * `omega/devices/restored-<copia>-<marca>/events.jsonl` y se deduplican por id.
 */
export async function restoreSnapshot(id: string): Promise<RestoreResult> {
  if (!isTauri()) {
    throw new Error('La restauración de copias solo está disponible en la app nativa.');
  }
  return invoke<RestoreResult>('vault_restore_snapshot', { id });
}

export async function getDeviceId(): Promise<string> {
  if (!isTauri()) return mockDeviceId();
  return invoke<string>('get_device_id');
}

export async function listEvents(): Promise<VaultEvent[]> {
  if (!isTauri()) return mockEvents();
  return invoke<VaultEvent[]>('list_events');
}

export async function appendEvent(ev: VaultEvent): Promise<void> {
  if (!isTauri()) {
    saveMockEvents([...mockEvents(), ev]);
    return;
  }
  return invoke<void>('append_event', { event: ev });
}

export async function getAppInfo(): Promise<AppInfo> {
  if (!isTauri()) {
    return {
      version: pkg.version,
      commit: 'navegador',
      build_date: new Date().toISOString().slice(0, 10),
      vault_schema_version: 1,
      install_format: 'navegador',
    };
  }
  return invoke<AppInfo>('get_app_info');
}

/**
 * Busca un producto por EAN/UPC. En la app nativa usa Rust (reqwest) y en el
 * modo navegador consulta Open Food Facts directamente para poder probar el
 * flujo sin compilar.
 */
export async function lookupBarcode(code: string): Promise<BarcodeProduct | null> {
  const barcode = code.replace(/\D/g, '');
  if (barcode.length < 6 || barcode.length > 14) {
    throw new Error('El código debe tener entre 6 y 14 dígitos (EAN/UPC).');
  }
  if (isTauri()) {
    return invoke<BarcodeProduct | null>('lookup_barcode', { code: barcode });
  }
  return lookupBarcodeWeb(barcode);
}

function categoryFromTags(tags: string[]): FoodCategory {
  const has = (needle: string) => tags.some((tag) => tag.includes(needle));
  if (has('beverage') || has('drink') || has('water') || has('juice') || has('soda')) return 'bebida';
  if (has('dairy') || has('milk') || has('cheese') || has('yogurt')) return 'lacteo';
  if (has('meat') || has('poultry') || has('ham') || has('sausage')) return 'carne';
  if (has('fish') || has('seafood')) return 'pescado';
  if (has('egg')) return 'huevo';
  if (has('fruit')) return 'fruta';
  if (has('vegetable') || has('salad')) return 'verdura';
  if (has('legume') || has('bean')) return 'legumbre';
  if (has('bread') || has('cereal') || has('pasta') || has('rice')) return 'cereal';
  if (has('nut') || has('seed')) return 'fruto_seco';
  if (has('oil') || has('fat') || has('butter')) return 'grasa';
  if (has('sauce') || has('condiment') || has('spice')) return 'condimento';
  if (has('sweet') || has('snack') || has('chocolate') || has('dessert')) return 'dulce';
  if (has('supplement') || has('protein')) return 'suplemento';
  return 'procesado';
}

async function lookupBarcodeWeb(barcode: string): Promise<BarcodeProduct | null> {
  let lastError: unknown = null;
  for (const candidate of barcodeVariants(barcode)) {
    try {
      const product = await fetchProductForBarcode(candidate, barcode);
      if (product) return product;
    } catch (error) {
      // Un fallo puntual con una variante no debe impedir probar las demás.
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}

async function fetchProductForBarcode(barcode: string, scanned: string): Promise<BarcodeProduct | null> {
  const fields = 'product_name,product_name_es,generic_name,brands,nutriments,categories_tags,quantity,serving_size';
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fields}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Food Facts respondió con estado ${response.status}.`);
  const payload = await response.json();
  if (payload?.status === 0 || !payload?.product) return null;
  const product = payload.product as Record<string, any>;
  const name = String(product.product_name_es || product.product_name || product.generic_name || '').trim();
  if (!name) return null;
  const brand = String(product.brands || '').trim();
  const nutriments = product.nutriments ?? {};
  const num = (key: string) => {
    const value = Number(nutriments[key]);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  const kcal = num('energy-kcal_100g') || num('energy_100g') / 4.184;
  const per100 = {
    kcal: Math.round(kcal * 10) / 10,
    protein: Math.round(num('proteins_100g') * 10) / 10,
    carbs: Math.round(num('carbohydrates_100g') * 10) / 10,
    fat: Math.round(num('fat_100g') * 10) / 10,
    fiber: Math.round(num('fiber_100g') * 10) / 10,
  };
  if (per100.kcal <= 0 && per100.protein <= 0 && per100.carbs <= 0 && per100.fat <= 0) return null;
  const tags = Array.isArray(product.categories_tags)
    ? product.categories_tags.map((tag: unknown) => String(tag).toLowerCase())
    : [];
  return {
    id: `off-${scanned}`,
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
    category: categoryFromTags(tags),
    per100,
    units: {},
    custom: true,
    barcode: scanned,
    source: 'openfoodfacts',
    quantityLabel: product.quantity ? String(product.quantity) : null,
    servingLabel: product.serving_size ? String(product.serving_size) : null,
  };
}

export function newEvent(deviceId: string, kind: string, payload: any): VaultEvent {
  return {
    id: crypto.randomUUID(),
    device_id: deviceId,
    timestamp: new Date().toISOString(),
    kind,
    payload,
  };
}

export function clearMockData(): void {
  localStorage.removeItem(MOCK_EVENTS_KEY);
  localStorage.removeItem(MOCK_VAULT_KEY);
  localStorage.removeItem(MOCK_DEVICE_KEY);
}

export { MOCK };
