import { invoke } from '@tauri-apps/api/core';

interface AppInfo {
  version: string;
  commit: string;
  build_date: string;
  vault_schema_version: number;
}

async function loadAbout(): Promise<void> {
  try {
    const info = await invoke<AppInfo>('get_app_info');
    const v = document.getElementById('version');
    const c = document.getElementById('commit');
    const d = document.getElementById('build-date');
    if (v) v.textContent = info.version;
    if (c) c.textContent = info.commit;
    if (d) d.textContent = info.build_date;
  } catch (e) {
    console.error('No se pudo obtener la versión', e);
  }
}

void loadAbout();