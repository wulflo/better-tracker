import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { tx, useLanguage } from '../i18n';
import { isTauri } from '../vault';

type ResizeDirection =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West';

/**
 * La app de escritorio usa una ventana sin marco nativo: los controles de
 * ventana viven dentro de la interfaz. En Android y en el navegador no se
 * muestran (ni se intenta llamar a la API de ventana).
 */
function isDesktopApp(): boolean {
  if (!isTauri() || typeof navigator === 'undefined') return false;
  return !/android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d="M2 6h8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="8"
        height="8"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path
        d="M4 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <rect
        x="2"
        y="4"
        width="6"
        height="6"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path
        d="M2.5 2.5l7 7m0-7l-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WindowControlsInner() {
  const { lang } = useLanguage();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let active = true;
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;

    const sync = () => {
      appWindow
        .isMaximized()
        .then((value) => {
          if (active) setMaximized(value);
        })
        .catch(() => {});
    };

    // `onResized` entrega eventos del sistema operativo y evita depender del
    // `resize` del DOM, que se dispara muchas veces por fotograma. Aun así lo
    // agrupamos: una sola consulta IPC tras el último cambio, no 60 por segundo.
    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        sync();
      }, 140);
    };

    sync();
    appWindow
      .onResized(schedule)
      .then((fn) => {
        if (active) unlisten = fn;
        else fn();
      })
      .catch(() => {
        // En navegador o si el evento no está disponible, mantenemos el
        // comportamiento antiguo con un temporizador para no consultar en cada
        // fotograma.
        if (!active) return;
        window.addEventListener('resize', schedule);
        unlisten = () => window.removeEventListener('resize', schedule);
      });

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  const minimize = () => {
    void getCurrentWindow().minimize().catch(() => {});
  };

  const toggleMaximize = () => {
    const appWindow = getCurrentWindow();
    appWindow
      .toggleMaximize()
      .then(() => appWindow.isMaximized())
      .then(setMaximized)
      .catch(() => {});
  };

  const close = () => {
    void getCurrentWindow().close().catch(() => {});
  };

  const minimizeLabel = tx(lang, 'Minimizar', 'Minimize');
  const maximizeLabel = maximized
    ? tx(lang, 'Restaurar', 'Restore')
    : tx(lang, 'Maximizar', 'Maximize');
  const closeLabel = tx(lang, 'Cerrar', 'Close');

  return (
    <div className="window-controls">
      <span className="window-controls-divider" aria-hidden="true" />
      <button className="window-control" type="button" aria-label={minimizeLabel} title={minimizeLabel} onClick={minimize}>
        <MinimizeIcon />
      </button>
      <button
        className="window-control"
        type="button"
        aria-label={maximizeLabel}
        title={maximizeLabel}
        aria-pressed={maximized}
        onClick={toggleMaximize}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        className="window-control window-control-close"
        type="button"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={close}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

export function WindowControls() {
  if (!isDesktopApp()) return null;
  return <WindowControlsInner />;
}

const RESIZE_HANDLES: Array<{ direction: ResizeDirection; position: string }> = [
  { direction: 'North', position: 'top' },
  { direction: 'South', position: 'bottom' },
  { direction: 'West', position: 'left' },
  { direction: 'East', position: 'right' },
  { direction: 'NorthWest', position: 'top-left' },
  { direction: 'NorthEast', position: 'top-right' },
  { direction: 'SouthWest', position: 'bottom-left' },
  { direction: 'SouthEast', position: 'bottom-right' },
];

/**
 * En Linux una ventana sin decoraciones no se puede redimensionar desde los
 * bordes. Estos tiradores invisibles llaman a `startResizeDragging` para
 * conservar el comportamiento de una ventana normal en todas las plataformas.
 *
 * Con la ventana maximizada no hay borde que arrastrar y, en algunos
 * compositores, un tirador fijo pegado al borde deja artefactos de repintado al
 * mover o arrastrar la ventana; por eso se ocultan (igual que en Study Planner).
 */
function WindowResizeHandlesInner() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let active = true;
    let unlisten: (() => void) | undefined;

    const sync = () => {
      appWindow
        .isMaximized()
        .then((value) => {
          if (active) setMaximized(value);
        })
        .catch(() => {});
    };

    sync();
    appWindow
      .onResized(sync)
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch(() => {});

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  if (maximized) return null;

  const startResize = (event: React.MouseEvent, direction: ResizeDirection) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    void getCurrentWindow().startResizeDragging(direction).catch(() => {});
  };

  return (
    <>
      {RESIZE_HANDLES.map(({ direction, position }) => (
        <div
          key={direction}
          className={`window-resize-handle window-resize-${position}`}
          data-tauri-drag-region="false"
          onMouseDown={(event) => startResize(event, direction)}
        />
      ))}
    </>
  );
}

export function WindowResizeHandles() {
  if (!isDesktopApp()) return null;
  return <WindowResizeHandlesInner />;
}
