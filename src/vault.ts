import { invoke } from '@tauri-apps/api/core';

export interface VaultEvent {
  id: string;
  device_id: string;
  timestamp: string;
  kind: string;
  payload: any;
}

export async function getVaultPath(): Promise<string | null> {
  return invoke<string | null>('get_vault_path');
}
export async function selectVault(): Promise<string> {
  return invoke<string>('select_vault');
}
export async function getDeviceId(): Promise<string> {
  return invoke<string>('get_device_id');
}
export async function listEvents(): Promise<VaultEvent[]> {
  return invoke<VaultEvent[]>('list_events');
}
export async function appendEvent(ev: VaultEvent): Promise<void> {
  return invoke<void>('append_event', { event: ev });
}
export function newEvent(deviceId: string, kind: string, payload: any): VaultEvent {
  return { id: crypto.randomUUID(), device_id: deviceId, timestamp: new Date().toISOString(), kind, payload };
}