import React, { useCallback, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { Icon } from './Icons';
import {
  canUseUpdater,
  checkForUpdate,
  installUpdate,
  updateSummary,
  type UpdateInfo,
} from '../updater';

type Status = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'error';

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
  const [update, setUpdate] = useState<Update | null>(null);
  const [details, setDetails] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null }>({
    downloaded: 0,
    total: null,
  });

  const enabled = canUseUpdater(installFormat);
  const busy = status === 'checking' || status === 'downloading';

  const onCheck = useCallback(async () => {
    if (!enabled || busy) return;
    setStatus('checking');
    setError('');
    setDetails(null);
    try {
      const result = await checkForUpdate();
      if (!result) {
        setStatus('current');
        setUpdate(null);
        notify('Better Tracker ya está actualizado.', 'success');
        return;
      }
      setUpdate(result);
      setDetails(updateSummary(result));
      setStatus('available');
    } catch (e) {
      setError(readableError(e));
      setStatus('error');
    }
  }, [busy, enabled, notify]);

  const onInstall = useCallback(async () => {
    if (!update || status === 'downloading') return;
    setStatus('downloading');
    setError('');
    setProgress({ downloaded: 0, total: null });
    try {
      await installUpdate(update, (downloaded, total) => setProgress({ downloaded, total }));
      notify('Actualización instalada. Reiniciando…', 'success');
    } catch (e) {
      setError(readableError(e));
      setStatus('error');
    }
  }, [notify, status, update]);

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
            Se comprueba solo cuando lo pides. El paquete se verifica con la firma criptográfica antes de instalarse.
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
              ? 'La actualización está disponible solo en la app de escritorio.'
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

      {status === 'available' && details && (
        <div className="update-card">
          <div className="row between wrap">
            <div>
              <div className="update-version">Versión {details.version} disponible</div>
              <div className="update-sub">
                Instalada: {details.currentVersion}
                {details.date ? ` · Publicada: ${new Date(details.date).toLocaleDateString('es')}` : ''}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={onInstall}>
              <Icon name="download" size={14} /> Instalar y reiniciar
            </button>
          </div>
          {details.body && <div className="update-notes">{details.body.slice(0, 900)}</div>}
        </div>
      )}

      {status === 'downloading' && (
        <div className="progress-wrap">
          <div className="progress-labels">
            <span>Descargando y verificando la firma…</span>
            <span>{progressPct === null ? `${Math.round(progress.downloaded / 1024)} KB` : `${progressPct}%`}</span>
          </div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${progressPct ?? 12}%`, background: 'var(--primary)' }} />
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
