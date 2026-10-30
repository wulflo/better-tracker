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
  restoreSnapshot,
  runBackup,
  selectVault,
  type BackupStatus,
  type SnapshotInfo,
} from './vault';
import { reduceExercises } from './metrics';
import PanelView from './PanelView';
import TrainingView from './TrainingView';
import HistoryView from './HistoryView';
import BodyView from './BodyView';
import WellnessView from './WellnessView';
import { Icon, LogoMark } from './components/Icons';
import { useLanguage, t } from './i18n';
import UpdatePanel from './components/UpdatePanel';
import { errorText } from './errors';
import { openRepository, REPOSITORY_URL } from './links';

type View = 'panel' | 'training' | 'history' | 'body' | 'wellness';
type ToastTone = 'success' | 'error' | 'info';

const NAV: Array<{ id: View; icon: string }> = [
  { id: 'panel', icon: 'dashboard' },
  { id: 'training', icon: 'dumbbell' },
  { id: 'history', icon: 'history' },
  { id: 'body', icon: 'body' },
  { id: 'wellness', icon: 'check' },
];

const TITLES: Record<View, string> = {
  panel: 'Panel',
  training: 'Entrenamiento',
  history: 'Historial',
  body: 'Figura corporal',
  wellness: 'Hábitos y ánimo',
};

/** Fecha local en el mismo formato que usa Rust para `longlife`. */
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
  const [restoreBusy, setRestoreBusy] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [eventDrop, setEventDrop] = useState<{ previous: number; current: number } | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [view, setView] = useState<View>('panel');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const dropWarnedRef = useRef('');
  const { lang, setLang } = useLanguage();

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ message, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await listEvents();
      setEvents(next);
      if (vault) {
        // La bóveda es append-only: si el número de eventos baja, algo externo
        // (FolderSync, una copia antigua del PC…) ha revertido archivos.
        const key = `bt.event-count:${vault}`;
        const previous = Number.parseInt(localStorage.getItem(key) ?? '', 10);
        if (Number.isFinite(previous) && previous > next.length) {
          setEventDrop({ previous, current: next.length });
          const signature = `${key}:${previous}:${next.length}`;
          if (dropWarnedRef.current !== signature) {
            dropWarnedRef.current = signature;
            notify(
              `Aviso: la bóveda tiene ${next.length} eventos y antes había ${previous}. Revisa longlife y restaura los que falten.`,
              'error',
            );
          }
        } else if (Number.isFinite(previous)) {
          setEventDrop(null);
        }
        localStorage.setItem(key, String(next.length));
      }
    } catch (e) {
      notify(`No se pudo leer la bóveda: ${errorText(e)}`, 'error');
    }
  }, [notify, vault]);

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

  // Copia diaria en `longlife`. La comprobación se repite cada 6 horas por si
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
        notify(`No se pudo leer el estado de longlife: ${errorText(e)}`, 'error');
      });
  }, [settingsOpen, vault, notify]);

  useEffect(() => {
    if (!settingsOpen) {
      setConfirmDeleteBackups(false);
      setConfirmRestore(null);
    }
  }, [settingsOpen]);

  // Si la bóveda se estrena o la copia de hoy se borró, el primer evento debe
  // programar la copia sin esperar al intervalo de 6 horas.
  const hasTodayCopy = backupStatus
    ? backupStatus.copies.some(
        (copy) => copy.current_device && copy.complete && copy.date === localDateKey(),
      )
    : false;
  useEffect(() => {
    if (!vault || !isTauri() || events.length === 0) return;
    if (hasTodayCopy) return;

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
  }, [vault, events.length, hasTodayCopy]);

  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      e.preventDefault();
      notify(`Error: ${errorText(e.reason)}`, 'error');
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
      if (!text.toLowerCase().includes('cancel')) notify(errorText(e), 'error');
    }
  };

  const createBackup = async () => {
    setBackupBusy(true);
    try {
      const result = await runBackup(true);
      setBackupStatus(result.status);
      if (result.created && result.date) {
        notify(`Copia de ${result.date} creada en longlife.`, 'success');
      } else {
        notify(result.skipped || 'No se creó ninguna copia.', 'info');
      }
    } catch (e) {
      notify(`No se pudo crear la copia: ${errorText(e)}`, 'error');
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
      notify('Todas las copias de longlife se han borrado. No se recreará hasta mañana.', 'success');
    } catch (e) {
      notify(`No se pudieron borrar las copias: ${errorText(e)}`, 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const restoreCopy = async (copy: SnapshotInfo) => {
    setRestoreBusy(copy.id);
    try {
      const result = await restoreSnapshot(copy.id);
      setConfirmRestore(null);
      await refresh();
      try {
        setBackupStatus(await getBackupStatus());
      } catch {
        // La restauración ya se aplicó; la lista se refrescará al abrir Ajustes.
      }
      if (result.imported > 0) {
        notify(
          `Restaurados ${result.imported} eventos en ${result.folder}. No se ha sobrescrito nada.`,
          'success',
        );
      } else {
        notify(
          `No faltaban eventos: la bóveda actual ya contiene los ${result.source_events} de esa copia.`,
          'info',
        );
      }
    } catch (e) {
      notify(`No se pudo restaurar la copia: ${errorText(e)}`, 'error');
    } finally {
      setRestoreBusy(null);
    }
  };

  const ownCopies = backupStatus?.copies.filter((copy) => copy.current_device) ?? [];
  const vaultName = vaultLabel || (vault ? vault.split(/[\\/]/).filter(Boolean).pop() || vault : '');
  const backupSummary = backupStatus
    ? backupStatus.copies.length > 0
      ? `${ownCopies.length}/${backupStatus.retention_days} copias de este dispositivo · última ${backupStatus.last_backup ?? '—'}`
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
              <span className="nav-label">{t(`nav.${item.id}`, lang)}</span>
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
          <button
            type="button"
            className="settings-btn"
            onClick={() => void openRepository().catch((e) => notify(errorText(e), 'error'))}
            title={REPOSITORY_URL}
          >
            <Icon name="repo" size={17} /> Repositorio
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
          {view === 'wellness' && (
            <WellnessView
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
            <span>{t(`nav.mobile.${item.id}`, lang)}</span>
          </button>
        ))}
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
              <div className="settings-row">
                <span className="muted">Repositorio</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void openRepository().catch((e) => notify(errorText(e), 'error'))}
                >
                  <Icon name="repo" size={14} /> Abrir GitHub
                </button>
              </div>
              <UpdatePanel installFormat={info?.install_format} notify={notify} />
              <div style={{ marginTop: 14 }}>
                <div className="modal-title" style={{ fontSize: 14, marginBottom: 4 }}>Copias de seguridad (longlife)</div>
                <div className="card-sub" style={{ marginBottom: 8 }}>
                  Una copia de <span className="mono">omega</span> por día y dispositivo en{' '}
                  <span className="mono">longlife/&lt;dispositivo&gt;/&lt;fecha&gt;</span>. Se conservan las{' '}
                  {backupStatus?.retention_days ?? 7} más recientes de cada dispositivo.
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
                {eventDrop && (
                  <div className="notice notice-error" style={{ marginTop: 10 }}>
                    <Icon name="info" size={16} />
                    <span>
                      La bóveda pasó de {eventDrop.previous} a {eventDrop.current} eventos. Una sincronización o una
                      copia antigua pudo sobrescribir archivos. Elige una copia de longlife y pulsa «Restaurar» para
                      recuperar solo los eventos que faltan.
                    </span>
                  </div>
                )}
                <div className="row wrap" style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={createBackup} disabled={backupBusy}>
                    <Icon name="history" size={14} /> {backupBusy ? 'Trabajando…' : 'Crear copia de hoy'}
                  </button>
                </div>
                {backupStatus && backupStatus.copies.length > 0 && (
                  <>
                    <div className="card-sub" style={{ marginTop: 12, marginBottom: 4 }}>
                      Copias disponibles ({backupStatus.copies.length}). Restaurar nunca borra ni sobrescribe datos:
                      importa a <span className="mono">omega/devices/restored-…</span> solo los eventos que falten.
                    </div>
                    <ul className="snapshot-list">
                      {[...backupStatus.copies].reverse().map((copy) => (
                        <li key={copy.id} className="snapshot-item">
                          <div className="snapshot-main">
                            <div className="snapshot-title">
                              <strong>{copy.date}</strong>
                              <span className="hint">{copy.device_label}</span>
                              {copy.current_device && <span className="badge badge-success">Este dispositivo</span>}
                              {copy.legacy && <span className="badge badge-muted">Formato antiguo</span>}
                              {copy.damaged && <span className="badge badge-warning">Dañada</span>}
                              {!copy.complete && !copy.damaged && (
                                <span className="badge badge-warning">Incompleta</span>
                              )}
                            </div>
                            <div className="hint small">
                              {copy.files} archivos · {formatBytes(copy.bytes)} · <span className="mono">{copy.id}</span>
                            </div>
                            {copy.damaged && (
                              <div className="hint small">
                                Contiene {copy.files}
                                {copy.expected_files !== null ? ` de ${copy.expected_files}` : ''} archivos según su
                                manifiesto. Restaurar usará solo lo que haya
                                {copy.current_device && copy.date === localDateKey()
                                  ? '; «Crear copia de hoy» la rehace completa.'
                                  : '; si necesitas el resto, usa otra copia.'}
                              </div>
                            )}
                          </div>
                          {confirmRestore === copy.id ? (
                            <div className="snapshot-actions">
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => void restoreCopy(copy)}
                                disabled={restoreBusy !== null}
                              >
                                {restoreBusy === copy.id ? 'Restaurando…' : 'Restaurar lo que falta'}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setConfirmRestore(null)}
                                disabled={restoreBusy !== null}
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setConfirmRestore(copy.id)}
                              disabled={restoreBusy !== null}
                            >
                              Restaurar
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="notice notice-warn" style={{ marginTop: 10 }}>
                  <Icon name="info" size={16} />
                  <span>
                    Zona de alto riesgo: borrar longlife es irreversible. La restauración es no destructiva, pero
                    conviene tener una copia reciente antes de tocar la bóveda.
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
                      ¿Borrar definitivamente las {backupStatus?.copies.length ?? 0} copias de longlife? Esta acción
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
                  La app solo lee y escribe datos en <span className="mono">omega</span>. Las copias longlife son una
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
