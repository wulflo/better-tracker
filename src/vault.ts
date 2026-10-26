import { invoke } from '@tauri-apps/api/core';
import pkg from '../package.json';
import type { AppInfo, VaultEvent } from './types';

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

export async function getVaultPath(): Promise<string | null> {
  if (!isTauri()) return localStorage.getItem(MOCK_VAULT_KEY);
  return invoke<string | null>('get_vault_path');
}

export async function selectVault(): Promise<string> {
  if (!isTauri()) {
    const path = localStorage.getItem(MOCK_VAULT_KEY) || 'Bóveda local (modo navegador)';
    localStorage.setItem(MOCK_VAULT_KEY, path);
    return path;
  }
  return invoke<string>('select_vault');
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
