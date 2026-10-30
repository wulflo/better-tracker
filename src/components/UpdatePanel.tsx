import React, { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from './Icons';
import {
  canUseUpdater,
  checkForUpdate,
  installUpdate,
  updaterUnavailableReason,
  type AvailableUpdate,
  type UpdatePhase,
} from '../updater';

type Status = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'error';

function readableError(error: unknown): string {
  const raw = String(error ?? '').replace(/\s+/g, ' ').trim();
  if (/network|connect|dns|timeout|timed out|request/i.test(raw)) {
    return 'No se pudo consultar el servidor de actualizaciones. Revisa tu conexión e inténtalo de nuevo.';
  }
  return raw.length > 280 ? `${raw.slice(0, 277)}…` : raw || 'Error desconocido al comprobar la actualización.';
}

export default function UpdatePanel({
  installFormat,
  notify,
}: {
  installFormat?: string;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [target, setTarget] = useState<AvailableUpdate | null>(null);
  const [error, setError] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const [phase, setPhase] = useState<UpdatePhase>('download');
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null }>({
    downloaded: 0,
    total: null,
  });

  const enabled = canUseUpdater(installFormat);
  const android = installFormat === 'apk';
  const packageFormat = installFormat === 'deb' || installFormat === 'rpm' ? installFormat : null;
  const busy = status === 'checking' || status === 'downloading';

  const onCheck = useCallback(async () => {
    if (!enabled || busy) return;
    setStatus('checking');
    setError('');
    setTarget(null);
    setSavedPath('');
    try {
      const result = await checkForUpdate(installFormat);
      if (!result) {
        setStatus('current');
        notify('Better Tracker ya está actualizado.', 'success');
        return;
      }
      setTarget(result);
      setStatus('available');
    } catch (e) {
      setError(readableError(e));
      setStatus('error');
    }
  }, [busy, enabled, installFormat, notify]);

  const onInstall = useCallback(async () => {
    if (!target || status === 'downloading') return;
    setStatus('downloading');
    setError('');
    setPhase('download');
    setProgress({ downloaded: 0, total: null });
    try {
      const result = await installUpdate(target, (downloaded, total, nextPhase) => {
        setProgress({ downloaded, total });
        if (nextPhase) setPhase(nextPhase);
      });
      if (result.kind === 'android') {
        setSavedPath(result.path);
        setStatus('ready');
        notify('APK guardada. Abre el archivo desde tu gestor de archivos para instalarla.', 'success');
      } else if (result.kind === 'package') {
        setSavedPath(result.path);
        setStatus('ready');
        notify('Paquete descargado y verificado. Se ha abierto el instalador del sistema.', 'success');
      } else {
        notify('Actualización instalada. Reiniciando…', 'success');
      }
    } catch (e) {
      setError(readableError(e));
      setStatus('error');
    }
  }, [notify, status, target]);

  const progressPct =
    progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  const onOpenSaved = useCallback(async () => {
    if (!savedPath) return;
    try {
      await invoke('open_update_file', { path: savedPath });
    } catch (e) {
      notify(readableError(e), 'error');
    }
  }, [notify, savedPath]);

  return (
    <div className="update-panel">
      <div className="update-head">
        <div>
          <div className="update-title">
            <Icon name="download" size={16} /> Actualizaciones
          </div>
          <div className="update-sub">
            {android
              ? 'Se comprueba solo cuando lo pides. La APK se descarga y se guarda en Descargas sin bloquear la app; la instalación es manual.'
              : packageFormat
                ? `Se comprueba solo cuando lo pides. El paquete .${packageFormat} se descarga en streaming, se verifica con SHA-256 y se abre con el instalador del sistema.`
                : 'Se comprueba solo cuando lo pides. El manifiesto se consulta sin caché y el paquete se verifica antes de instalarse.'}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onCheck} disabled={!enabled || busy}>
          <Icon name={busy ? 'clock' : 'download'} size={14} />
          {status === 'checking' ? 'Comprobando…' : 'Buscar actualizaciones'}
        </button>
      </div>

      {!enabled && (
        <div className="notice notice-warn">
          <Icon name="info" size={16} />
          <span>{updaterUnavailableReason(installFormat)}</span>
        </div>
      )}

      {status === 'current' && (
        <div className="notice notice-success">
          <Icon name="check" size={16} />
          <span>Ya tienes la última versión disponible.</span>
        </div>
      )}

      {status === 'available' && target && (
        <div className="update-card">
          <div className="row between wrap">
            <div>
              <div className="update-version">Versión {target.info.version} disponible</div>
              <div className="update-sub">
                Instalada: {target.info.currentVersion}
                {target.info.date ? ` · Publicada: ${new Date(target.info.date).toLocaleDateString('es')}` : ''}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={onInstall}>
              <Icon name="download" size={14} />{' '}
              {android
                ? 'Descargar APK'
                : packageFormat
                  ? `Descargar .${packageFormat} e instalar`
                  : 'Instalar y reiniciar'}
            </button>
          </div>
          {target.info.body && <div className="update-notes">{target.info.body.slice(0, 900)}</div>}
        </div>
      )}

      {status === 'downloading' && (
        <div className="progress-wrap">
          <div className="progress-labels">
            <span>
              {android
                ? phase === 'save'
                  ? 'Guardando la APK en Descargas…'
                  : 'Descargando y verificando el APK…'
                : packageFormat
                  ? `Descargando y verificando el paquete .${packageFormat}…`
                  : 'Descargando y verificando la firma…'}
            </span>
            <span>
              {progressPct === null ? `${Math.round(progress.downloaded / 1024)} KB` : `${progressPct}%`}
            </span>
          </div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${progressPct ?? 12}%`, background: 'var(--primary)' }} />
          </div>
        </div>
      )}

      {status === 'ready' && (
        <div className="notice notice-success">
          <Icon name="check" size={16} />
          <div className="stack-sm">
            <span>
              {android ? (
                <>
                  APK guardada en <span className="mono">{savedPath}</span>. Abre el archivo desde un gestor de archivos
                  para instalar la nueva versión; Android puede pedirte permitir la instalación desde el gestor.
                </>
              ) : (
                <>
                  Paquete guardado y verificado en <span className="mono">{savedPath}</span>. Se ha abierto el instalador
                  del sistema; si no aparece, ábrelo manualmente desde Descargas.
                </>
              )}
            </span>
            {packageFormat && (
              <div>
                <button className="btn btn-tonal btn-sm" onClick={onOpenSaved}>
                  <Icon name="download" size={14} /> Abrir instalador de nuevo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="notice notice-error">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
