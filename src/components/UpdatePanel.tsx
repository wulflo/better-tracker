import React, { useCallback, useState } from 'react';
import { Icon } from './Icons';
import {
  canUseUpdater,
  checkForUpdate,
  installUpdate,
  type AvailableUpdate,
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
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null }>({
    downloaded: 0,
    total: null,
  });

  const enabled = canUseUpdater(installFormat);
  const android = installFormat === 'apk';
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
    setProgress({ downloaded: 0, total: null });
    try {
      const result = await installUpdate(target, (downloaded, total) => setProgress({ downloaded, total }));
      if (result.kind === 'android') {
        setSavedPath(result.path);
        setStatus('ready');
        notify('APK guardada. Abre el archivo desde tu gestor de archivos para instalarla.', 'success');
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

  return (
    <div className="update-panel">
      <div className="update-head">
        <div>
          <div className="update-title">
            <Icon name="download" size={16} /> Actualizaciones
          </div>
          <div className="update-sub">
            {android
              ? 'Se comprueba solo cuando lo pides. La APK se verifica con SHA-256 y se guarda en Descargas; la instalación es manual.'
              : 'Se comprueba solo cuando lo pides. El paquete se verifica con la firma criptográfica antes de instalarse.'}
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
          <span>
            {installFormat === 'navegador'
              ? 'La actualización está disponible solo en la app nativa.'
              : 'En Linux la actualización integrada solo funciona con AppImage. Si usas .deb, .rpm o un binario portable, descarga el paquete nuevo desde GitHub Releases.'}
          </span>
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
              <Icon name="download" size={14} /> {android ? 'Descargar APK' : 'Instalar y reiniciar'}
            </button>
          </div>
          {target.info.body && <div className="update-notes">{target.info.body.slice(0, 900)}</div>}
        </div>
      )}

      {status === 'downloading' && (
        <div className="progress-wrap">
          <div className="progress-labels">
            <span>{android ? 'Descargando y verificando el APK…' : 'Descargando y verificando la firma…'}</span>
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
          <span>
            APK guardada en <span className="mono">{savedPath}</span>. Abre el archivo desde un gestor de archivos
            para instalar la nueva versión; Android puede pedirte permitir la instalación desde el gestor de archivos.
          </span>
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
