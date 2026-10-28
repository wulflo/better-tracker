import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppInfo, Exercise, VaultEvent } from './types';
import {
  appendEvent,
  deleteBackups,
  getAppInfo,
  getBackupStatus,
  getDeviceId,
  getVaultInfo,
  isTauri,
  listEvents,
  newEvent,
  runBackup,
  selectVault,
  type BackupStatus,
} from './vault';
import { reduceExercises } from './metrics';
import PanelView from './PanelView';
import TrainingView from './TrainingView';
import HistoryView from './HistoryView';
import BodyView from './BodyView';
import { Icon, LogoMark } from './components/Icons';
import { useLanguage, t } from './i18n';
import UpdatePanel from './components/UpdatePanel';

type View = 'panel' | 'training' | 'history' | 'body';
type ToastTone = 'success' | 'error' | 'info';

const NAV: Array<{ id: View; label: string; icon: string }> = [
  { id: 'panel', label: 'Panel', icon: 'dashboard' },
  { id: 'training', label: 'Entrenamiento', icon: 'dumbbell' },
  { id: 'history', label: 'Historial', icon: 'history' },
  { id: 'body', label: 'Figura corporal', icon: 'body' },
];

const TITLES: Record<View, string> = {
  panel: 'Panel',
  training: 'Entrenamiento',
  history: 'Historial',
  body: 'Figura corporal',
};

/** Fecha local en el mismo formato que usa Rust para `Longlife`. */
function localDateKey(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [vault, setVault] = useState<string | null>(null);
  const [vaultLabel, setVaultLabel] = useState<string | null>(null);
  const [vaultDataDir, setVaultDataDir] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [confirmDeleteBackups, setConfirmDeleteBackups] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [view, setView] = useState<View>('panel');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const { lang, setLang } = useLanguage();

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ message, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setEvents(await listEvents());
    } catch (e) {
      notify(`No se pudo leer la bóveda: ${String(e)}`, 'error');
    }
  }, [notify]);

  useEffect(() => {
    getAppInfo().then(setInfo).catch(() => {});
    getVaultInfo()
      .then((value) => {
        setVault(value.path);
        setVaultLabel(value.label);
        setVaultDataDir(value.data_dir);
      })
      .catch(() => {});
    getDeviceId().then(setDeviceId).catch(() => {});
  }, []);

  useEffect(() => {
    if (vault) void refresh();
  }, [vault, refresh]);

  useEffect(() => {
    const onRefresh = () => void refresh();
    window.addEventListener('better-tracker:refresh', onRefresh);
    return () => window.removeEventListener('better-tracker:refresh', onRefresh);
  }, [refresh]);

  // Copia diaria en `Longlife`. La comprobación se repite cada 6 horas por si
  // la app queda abierta, y siempre es idempotente: solo crea una copia por día.
  useEffect(() => {
    if (!vault || !isTauri()) return;
    let active = true;

    const backup = async () => {
      try {
        const result = await runBackup();
        if (active) setBackupStatus(result.status);
      } catch {
        // No interrumpimos el uso normal de la app si la bóveda no está
        // disponible; el usuario verá el error al abrir los ajustes.
      }
    };

    const initial = window.setTimeout(backup, 2_500);
    const interval = window.setInterval(backup, 6 * 60 * 60 * 1000);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [vault]);

  useEffect(() => {
    if (!settingsOpen || !vault) return;
    getBackupStatus()
      .then(setBackupStatus)
      .catch((e) => {
        setBackupStatus(null);
        notify(`No se pudo leer el estado de Longlife: ${String(e)}`, 'error');
      });
  }, [settingsOpen, vault, notify]);

  useEffect(() => {
    if (!settingsOpen) setConfirmDeleteBackups(false);
  }, [settingsOpen]);

  // Si la bóveda se estrena o la copia de hoy se borró, el primer evento debe
  // programar la copia sin esperar al intervalo de 6 horas.
  useEffect(() => {
    if (!vault || !isTauri() || events.length === 0) return;
    if (backupStatus?.last_backup === localDateKey()) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await runBackup();
        if (active) setBackupStatus(result.status);
      } catch {
        // El intervalo de 6 horas volverá a intentarlo.
      }
    }, 5_000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [vault, events.length, backupStatus?.last_backup]);

  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      e.preventDefault();
      notify(`Error: ${String(e.reason)}`, 'error');
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [notify]);

  const exercises = useMemo(() => reduceExercises(events), [events]);

  const chooseVault = async () => {
    try {
      const next = await selectVault();
      setVault(next.path);
      setVaultLabel(next.label);
      setVaultDataDir(next.path.startsWith('{') || next.path.startsWith('content://') ? 'omega' : `${next.path}/omega`);
      setBackupStatus(null);
      setConfirmDeleteBackups(false);
      notify('Bóveda seleccionada.', 'success');
      try {
        const result = await runBackup();
        setBackupStatus(result.status);
      } catch {
        // La copia diaria se reintenta sola; no impide usar la nueva bóveda.
      }
    } catch (e) {
      const text = String(e);
      if (!text.toLowerCase().includes('cancel')) notify(text, 'error');
    }
  };

  const createBackup = async () => {
    setBackupBusy(true);
    try {
      const result = await runBackup(true);
      setBackupStatus(result.status);
      if (result.created && result.date) {
        notify(`Copia de ${result.date} creada en Longlife.`, 'success');
      } else {
        notify(result.skipped || 'No se creó ninguna copia.', 'info');
      }
    } catch (e) {
      notify(`No se pudo crear la copia: ${String(e)}`, 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const removeBackups = async () => {
    setBackupBusy(true);
    try {
      const status = await deleteBackups();
      setBackupStatus(status);
      setConfirmDeleteBackups(false);
      notify('Todas las copias de Longlife se han borrado. No se recreará hasta mañana.', 'success');
    } catch (e) {
      notify(`No se pudieron borrar las copias: ${String(e)}`, 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const vaultName = vaultLabel || (vault ? vault.split(/[\\/]/).filter(Boolean).pop() || vault : '');
  const backupSummary = backupStatus
    ? backupStatus.copies.length > 0
      ? `${backupStatus.copies.length}/${backupStatus.retention_days} copias · última ${backupStatus.last_backup}`
      : 'Sin copias todavía'
    : 'Cargando…';
  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  };

  const seedSample = async () => {
    if (!deviceId) return;
    const today = new Date();
    const iso = (offset: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const sampleExercises: Exercise[] = [
      { id: 'ex-bench', name: 'Press banca', zone: 'chest', type: 'fuerza' },
      { id: 'ex-row', name: 'Remo con barra', zone: 'back', type: 'fuerza' },
      { id: 'ex-squat', name: 'Sentadilla', zone: 'legs', type: 'fuerza' },
      { id: 'ex-press', name: 'Press militar', zone: 'shoulders', type: 'fuerza' },
      { id: 'ex-curl', name: 'Curl bíceps', zone: 'arms', type: 'fuerza' },
      { id: 'ex-plank', name: 'Plancha', zone: 'core', type: 'fuerza' },
      { id: 'ex-run', name: 'Carrera suave', zone: 'cardio', type: 'cardio' },
    ];
    for (const ex of sampleExercises) {
      await appendEvent(newEvent(deviceId, 'exercise.upsert', ex));
    }
    const routine = {
      id: 'routine-sample',
      name: 'Full body ejemplo',
      exercises: [
        { exerciseId: 'ex-bench', sets: 4, reps: 8, load: 60, rest: 120 },
        { exerciseId: 'ex-row', sets: 4, reps: 10, load: 50, rest: 90 },
        { exerciseId: 'ex-squat', sets: 4, reps: 8, load: 80, rest: 150 },
        { exerciseId: 'ex-plank', sets: 3, reps: 45, load: 0, rest: 60 },
      ],
    };
    await appendEvent(newEvent(deviceId, 'routine.saved', routine));
    await appendEvent(newEvent(deviceId, 'measurement.saved', {
      date: iso(0), sex: 'male', age: 30, weight: 76, height: 176,
      neck: 38, chest: 102, waist: 84, hip: 96, arm: 33, thigh: 56, calf: 38, wrist: 17,
    }));
    await appendEvent(newEvent(deviceId, 'weight.logged', { date: iso(-6), kg: 77.4 }));
    await appendEvent(newEvent(deviceId, 'weight.logged', { date: iso(0), kg: 76 }));
    await appendEvent(newEvent(deviceId, 'nutrition.logged', {
      date: iso(0), kcal: 2100, protein: 130, carbs: 240, fat: 68, fiber: 28, water: 2400,
    }));
    await appendEvent(newEvent(deviceId, 'goal.mode', { mode: 'maintain' }));
    for (let w = 7; w >= 1; w--) {
      const day = iso(-w * 2);
      await appendEvent(newEvent(deviceId, 'session.saved', {
        id: crypto.randomUUID(),
        date: day,
        routineId: routine.id,
        duration: 3300 + w * 120,
        rpeSession: 7,
        entries: [
          { exerciseId: 'ex-bench', sets: [{ reps: 8, weight: 60 + (7 - w) * 2.5 }, { reps: 8, weight: 60 + (7 - w) * 2.5 }, { reps: 7, weight: 62.5 + (7 - w) * 2.5 }] },
          { exerciseId: 'ex-row', sets: [{ reps: 10, weight: 50 + (7 - w) * 2 }, { reps: 10, weight: 50 + (7 - w) * 2 }, { reps: 9, weight: 52 + (7 - w) * 2 }] },
          { exerciseId: 'ex-squat', sets: [{ reps: 8, weight: 80 + (7 - w) * 5 }, { reps: 8, weight: 80 + (7 - w) * 5 }] },
        ],
      }));
    }
    await refresh();
    notify('Datos de ejemplo cargados.', 'success');
  };

  const onRefresh = refresh;

  if (!vault) {
    return (
      <div className="hero">
        <div className="hero-card">
          <div className="hero-logo"><LogoMark size={64} /></div>
          <h1>Better Tracker</h1>
          <p>
            Tu entrenamiento, composición corporal y saciedad dual, todo local. Sin cuentas, sin telemetría y con actualizaciones firmadas solo cuando las pides.
          </p>
          <button className="btn btn-primary" onClick={chooseVault}>
            <Icon name="plus" size={16} /> Seleccionar bóveda
          </button>
          <div className="hero-device">Dispositivo: {deviceId || 'generando…'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><LogoMark size={40} /></div>
          <div className="brand-text">
            <strong>Better Tracker</strong>
            <span>{t('app.subtitle', lang)}</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon"><Icon name={item.icon} size={19} /></span>
              <span className="nav-label">{t(`nav.${item.id === 'panel' ? 'panel' : item.id === 'training' ? 'training' : item.id === 'history' ? 'history' : 'body'}`, lang)}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <div className="vault-chip" title={vault ?? undefined}>
            <span className="status-dot" />
            <span>{vaultName}</span>
          </div>
          <button type="button" className="settings-btn" onClick={() => setSettingsOpen(true)}>
            <Icon name="settings" size={17} /> {t('settings', lang)}
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="row wrap">
            <span className="badge badge-success"><span className="status-dot" /> Solo local</span>
            <span className="hint">Datos locales · sin cuentas · sin telemetría</span>
          </div>
          <div className="topbar-actions">
            <span className="hint">{new Date().toLocaleDateString(lang === 'en' ? 'en' : 'es', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <button className="btn-icon" aria-label="Ajustes" onClick={() => setSettingsOpen(true)}>
              <Icon name="settings" size={17} />
            </button>
          </div>
        </header>

        <div className="content">
          {view === 'panel' && (
            <PanelView
              deviceId={deviceId}
              events={events}
              exercises={exercises}
              onRefresh={onRefresh}
              notify={notify}
              onNavigate={(next) => setView(next)}
            />
          )}
          {view === 'training' && (
            <TrainingView
              deviceId={deviceId}
              events={events}
              exercises={exercises}
              onRefresh={onRefresh}
              notify={notify}
            />
          )}
          {view === 'history' && (
            <HistoryView
              deviceId={deviceId}
              events={events}
              exercises={exercises}
              onRefresh={onRefresh}
              notify={notify}
            />
          )}
          {view === 'body' && (
            <BodyView
              deviceId={deviceId}
              events={events}
              onRefresh={onRefresh}
              notify={notify}
            />
          )}
          <div className="row between wrap" style={{ marginTop: 18 }}>
            <span className="hint">Better Tracker · {info ? `v${info.version}` : 'v—'} · {events.length} eventos locales</span>
            <span className="hint">Bóveda: {vaultName}{vaultDataDir ? ` · datos en ${vaultDataDir}` : ''}</span>
          </div>
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Navegación principal móvil">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bottom-nav-item ${view === item.id ? 'active' : ''}`}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => setView(item.id)}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          className="bottom-nav-item"
          aria-label="Ajustes"
          onClick={() => setSettingsOpen(true)}
        >
          <Icon name="settings" size={20} />
          <span>{t('settings', lang)}</span>
        </button>
      </nav>

      {settingsOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="modal" style={{ width: 'min(620px, 100%)' }}>
            <div className="modal-header">
              <div>
                <div className="modal-title" id="settings-title">{t('settings', lang)}</div>
                <div className="card-sub">Estado local de Better Tracker. Sin cuentas ni telemetría; actualizaciones opcionales.</div>
              </div>
              <button className="btn-icon" aria-label="Cerrar ajustes" onClick={() => setSettingsOpen(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="settings-row">
                <span className="muted">Bóveda</span>
                <span className="value" title={vault ?? undefined}>{vaultName}</span>
              </div>
              {vaultDataDir && (
                <div className="settings-row">
                  <span className="muted">Datos de la app</span>
                  <span className="value mono small">{vaultDataDir}</span>
                </div>
              )}
              <div className="settings-row">
                <span className="muted">Dispositivo</span>
                <span className="value mono">{deviceId}</span>
              </div>
              <div className="settings-row">
                <span className="muted">Versión</span>
                <span className="value">{info?.version ?? '—'}</span>
              </div>
              <div className="settings-row">
                <span className="muted">Commit</span>
                <span className="value mono">{info?.commit ?? '—'}</span>
              </div>
              <div className="settings-row">
                <span className="muted">Build</span>
                <span className="value">{info?.build_date ?? '—'}</span>
              </div>
              <div className="settings-row">
                <span className="muted">Esquema de bóveda</span>
                <span className="value">v{info?.vault_schema_version ?? '—'}</span>
              </div>
              <div className="settings-row">
                <span className="muted">Eventos</span>
                <span className="value">{events.length}</span>
              </div>
              <div className="settings-row">
                <span className="muted">{t('language', lang)}</span>
                <select className="select" value={lang} onChange={e => setLang(e.target.value as any)}>
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="settings-row">
                <span className="muted">Formato instalado</span>
                <span className="value mono">{info?.install_format ?? '—'}</span>
              </div>
              <div className="settings-row">
                <span className="muted">Código de barras</span>
                <span className="value small">Escanea desde Panel → Ingesta → Escanear código</span>
              </div>
              <UpdatePanel installFormat={info?.install_format} notify={notify} />
              <div style={{ marginTop: 14 }}>
                <div className="modal-title" style={{ fontSize: 14, marginBottom: 4 }}>Copias de seguridad (Longlife)</div>
                <div className="card-sub" style={{ marginBottom: 8 }}>
                  Una copia idéntica de <span className="mono">omega</span> por día. Se conservan las{' '}
                  {backupStatus?.retention_days ?? 7} más recientes.
                </div>
                <div className="settings-row">
                  <span className="muted">Estado</span>
                  <span className="value small">{backupSummary}</span>
                </div>
                {backupStatus && backupStatus.copies.length > 0 && (
                  <div className="settings-row">
                    <span className="muted">Tamaño total</span>
                    <span className="value">{formatBytes(backupStatus.total_bytes)}</span>
                  </div>
                )}
                <div className="row wrap" style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={createBackup} disabled={backupBusy}>
                    <Icon name="history" size={14} /> {backupBusy ? 'Trabajando…' : 'Crear copia de hoy'}
                  </button>
                </div>
                <div className="notice notice-warn" style={{ marginTop: 10 }}>
                  <Icon name="info" size={16} />
                  <span>
                    Zona de alto riesgo: borrar Longlife es irreversible. La app no usa esas copias como datos; solo
                    las enumera para mostrarlas. Para restaurar una, muévela manualmente al directorio{' '}
                    <span className="mono">omega</span>.
                  </span>
                </div>
                {!confirmDeleteBackups ? (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setConfirmDeleteBackups(true)}
                    disabled={backupBusy || !backupStatus || backupStatus.copies.length === 0}
                  >
                    <Icon name="close" size={14} /> Borrar todas las copias
                  </button>
                ) : (
                  <div className="notice notice-error">
                    <Icon name="info" size={16} />
                    <span>
                      ¿Borrar definitivamente las {backupStatus?.copies.length ?? 0} copias de Longlife? Esta acción
                      no se puede deshacer.
                    </span>
                    <div className="row wrap" style={{ marginTop: 8 }}>
                      <button className="btn btn-danger btn-sm" onClick={removeBackups} disabled={backupBusy}>
                        Sí, borrar todo
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setConfirmDeleteBackups(false)}
                        disabled={backupBusy}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="notice notice-info">
                <Icon name="info" size={16} />
                <span>
                  La app solo lee y escribe datos en <span className="mono">omega</span>. Las copias Longlife son una
                  red de seguridad local; no se exportan ni se envían a ningún servidor. Las únicas conexiones de red
                  son la comprobación manual de actualizaciones y la consulta opcional a Open Food Facts al escanear un
                  código.
                </span>
              </div>
              {!isTauri() && (
                <div className="notice notice-warn">
                  <Icon name="info" size={16} />
                  <span>
                    Estás en modo navegador: los eventos se guardan en localStorage. En la app de escritorio se usa la
                    bóveda real y los diálogos nativos.
                  </span>
                </div>
              )}
              {!isTauri() && (
                <div className="row between wrap">
                  <button className="btn btn-ghost btn-sm" onClick={seedSample}>
                    <Icon name="plus" size={14} /> Cargar datos de ejemplo
                  </button>
                  <span className="hint">Solo para probar la interfaz.</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSettingsOpen(false)}>Cerrar</button>
              <button className="btn btn-primary" onClick={chooseVault}>
                <Icon name="history" size={15} /> Cambiar bóveda
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      )}
    </div>
  );
}
