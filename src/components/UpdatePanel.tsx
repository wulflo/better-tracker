import React, { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from './Icons';
import { locale, tx, useLanguage } from '../i18n';
import {
  canUseUpdater,
  checkForUpdate,
  installUpdate,
  updaterUnavailableReason,
  type AvailableUpdate,
  type UpdatePhase,
} from '../updater';

type Status = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'error';

function readableError(error: unknown, lang: 'es' | 'en'): string {
  const raw = String(error ?? '').replace(/\s+/g, ' ').trim();
  if (/network|connect|dns|timeout|timed out|request/i.test(raw)) {
    return tx(
      lang,
      'No se pudo consultar el servidor de actualizaciones. Revisa tu conexión e inténtalo de nuevo.',
      'Could not reach the update server. Check your connection and try again.',
    );
  }
  return raw.length > 280
    ? `${raw.slice(0, 277)}…`
    : raw || tx(lang, 'Error desconocido al comprobar la actualización.', 'Unknown error while checking for updates.');
}

export default function UpdatePanel({
  installFormat,
  notify,
}: {
  installFormat?: string;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const { lang } = useLanguage();
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
  const storeFormat =
    installFormat === 'snap' || installFormat === 'flatpak' || installFormat === 'msix'
      ? installFormat
      : null;
  const busy = status === 'checking' || status === 'downloading';

  const onCheck = useCallback(async () => {
    if (!enabled || busy) return;
    setStatus('checking');
    setError('');
    setTarget(null);
    setSavedPath('');
    try {
      const result = await checkForUpdate(installFormat, lang);
      if (!result) {
        setStatus('current');
        notify(tx(lang, 'Better Tracker ya está actualizado.', 'Better Tracker is up to date.'), 'success');
        return;
      }
      setTarget(result);
      setStatus('available');
    } catch (e) {
      setError(readableError(e, lang));
      setStatus('error');
    }
  }, [busy, enabled, installFormat, notify, lang]);

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
        notify(
          tx(
            lang,
            'APK guardada. Abre el archivo desde tu gestor de archivos para instalarla.',
            'APK saved. Open the file from your file manager to install it.',
          ),
          'success',
        );
      } else if (result.kind === 'package') {
        setSavedPath(result.path);
        setStatus('ready');
        notify(
          tx(
            lang,
            'Paquete descargado y verificado. Se ha abierto el instalador del sistema.',
            'Package downloaded and verified. The system installer has been opened.',
          ),
          'success',
        );
      } else {
        notify(tx(lang, 'Actualización instalada. Reiniciando…', 'Update installed. Restarting…'), 'success');
      }
    } catch (e) {
      setError(readableError(e, lang));
      setStatus('error');
    }
  }, [notify, status, target, lang]);

  const progressPct =
    progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  const onOpenSaved = useCallback(async () => {
    if (!savedPath) return;
    try {
      await invoke('open_update_file', { path: savedPath });
    } catch (e) {
      notify(readableError(e, lang), 'error');
    }
  }, [notify, savedPath, lang]);

  return (
    <div className="update-panel">
      <div className="update-head">
        <div>
          <div className="update-title">
            <Icon name="download" size={16} /> {tx(lang, 'Actualizaciones', 'Updates')}
          </div>
          <div className="update-sub">
            {storeFormat
              ? updaterUnavailableReason(storeFormat, lang)
              : android
                ? tx(
                    lang,
                    'Se comprueba solo cuando lo pides. La APK se descarga y se guarda en Descargas sin bloquear la app; la instalación es manual.',
                    'Checked only when you ask. The APK downloads to Downloads without blocking the app; installation is manual.',
                  )
                : packageFormat
                  ? tx(
                      lang,
                      `Se comprueba solo cuando lo pides. El paquete .${packageFormat} se descarga en streaming, se verifica con SHA-256 y firma minisign, y se abre con el instalador del sistema.`,
                      `Checked only when you ask. The .${packageFormat} package is streamed, verified with SHA-256 and minisign signature, and opened with the system installer.`,
                    )
                  : tx(
                      lang,
                      'Se comprueba solo cuando lo pides. El manifiesto se consulta sin caché y el paquete se verifica antes de instalarse.',
                      'Checked only when you ask. The manifest is fetched without cache and the package is verified before installing.',
                    )}
          </div>
        </div>
        {!storeFormat && (
          <button className="btn btn-ghost btn-sm" onClick={onCheck} disabled={!enabled || busy}>
            <Icon name={busy ? 'clock' : 'download'} size={14} />
            {status === 'checking'
              ? tx(lang, 'Comprobando…', 'Checking…')
              : tx(lang, 'Buscar actualizaciones', 'Check for updates')}
          </button>
        )}
      </div>

      {!enabled && !storeFormat && (
        <div className="notice notice-warn">
          <Icon name="info" size={16} />
          <span>{updaterUnavailableReason(installFormat, lang)}</span>
        </div>
      )}

      {status === 'current' && (
        <div className="notice notice-success">
          <Icon name="check" size={16} />
          <span>{tx(lang, 'Ya tienes la última versión disponible.', 'You already have the latest available version.')}</span>
        </div>
      )}

      {status === 'available' && target && (
        <div className="update-card">
          <div className="row between wrap">
            <div>
              <div className="update-version">
                {tx(lang, `Versión ${target.info.version} disponible`, `Version ${target.info.version} available`)}
              </div>
              <div className="update-sub">
                {tx(lang, 'Instalada:', 'Installed:')} {target.info.currentVersion}
                {target.info.date
                  ? ` · ${tx(lang, 'Publicada:', 'Published:')} ${new Date(target.info.date).toLocaleDateString(locale(lang))}`
                  : ''}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={onInstall}>
              <Icon name="download" size={14} />{' '}
              {android
                ? tx(lang, 'Descargar APK', 'Download APK')
                : packageFormat
                  ? tx(lang, `Descargar .${packageFormat} e instalar`, `Download .${packageFormat} and install`)
                  : tx(lang, 'Instalar y reiniciar', 'Install and restart')}
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
                  ? tx(lang, 'Guardando la APK en Descargas…', 'Saving the APK to Downloads…')
                  : tx(lang, 'Descargando y verificando el APK…', 'Downloading and verifying the APK…')
                : packageFormat
                  ? tx(
                      lang,
                      `Descargando y verificando el paquete .${packageFormat} (SHA-256 y firma)…`,
                      `Downloading and verifying the .${packageFormat} package (SHA-256 and signature)…`,
                    )
                  : tx(lang, 'Descargando y verificando la firma…', 'Downloading and verifying the signature…')}
            </span>
            <span>
              {progressPct === null
                ? tx(lang, `${Math.round(progress.downloaded / 1024)} KB`, `${Math.round(progress.downloaded / 1024)} KB`)
                : `${progressPct}%`}
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
                  {tx(lang, 'APK guardada en ', 'APK saved to ')}
                  <span className="mono">{savedPath}</span>
                  {tx(
                    lang,
                    '. Abre el archivo desde un gestor de archivos para instalar la nueva versión; Android puede pedirte permitir la instalación desde el gestor.',
                    '. Open the file from a file manager to install the new version; Android may ask you to allow installation from the manager.',
                  )}
                </>
              ) : (
                <>
                  {tx(lang, 'Paquete guardado y verificado en ', 'Package saved and verified at ')}
                  <span className="mono">{savedPath}</span>
                  {tx(
                    lang,
                    '. Se ha abierto el instalador del sistema; si no aparece, ábrelo manualmente desde Descargas.',
                    '. The system installer has been opened; if it does not appear, open it manually from Downloads.',
                  )}
                </>
              )}
            </span>
            {packageFormat && (
              <div>
                <button className="btn btn-tonal btn-sm" onClick={onOpenSaved}>
                  <Icon name="download" size={14} /> {tx(lang, 'Abrir instalador de nuevo', 'Open installer again')}
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
