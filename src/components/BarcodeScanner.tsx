import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  Format,
  cancel,
  checkPermissions,
  openAppSettings,
  requestPermissions,
  scan,
} from '@tauri-apps/plugin-barcode-scanner';
import { platform } from '@tauri-apps/plugin-os';
import { errorText } from '../errors';
import { isTauri } from '../vault';

interface Props {
  onResult: (code: string) => void;
  onClose?: () => void;
}

/** Códigos de barras de producto, no solo QR. */
const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.QR_CODE,
];

/**
 * El plugin añade QR internamente (`mapFormats` convierte QR en 0 y el nativo
 * lo vuelve a añadir). Si se pasa QRCode explícitamente, Android recibe un
 * formato inválido y `scan()` puede fallar al configurar ML Kit.
 */
const NATIVE_FORMATS = [
  Format.EAN13,
  Format.EAN8,
  Format.UPC_A,
  Format.UPC_E,
  Format.Code128,
];

function nativeMobile(): boolean {
  if (!isTauri() || typeof navigator === 'undefined') return false;
  try {
    const current = platform();
    if (current === 'android' || current === 'ios') return true;
  } catch {
    // La comprobación por user agent queda como respaldo si el plugin OS no
    // está disponible en una build antigua.
  }
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

const CAMERA_SETTINGS_HINT =
  'Abre Ajustes de Android → Aplicaciones → Better Tracker → Permisos → Cámara y elige «Permitir».';

export default function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef(onResult);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const mobile = nativeMobile();

  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let cancelled = false;
    let controls: { stop: () => void } | null = null;
    setError(null);
    setShowSettings(false);
    setRunning(false);

    const emit = (code: string) => {
      if (cancelled) return;
      resultRef.current(code);
      setRunning(false);
    };

    const startNative = async () => {
      try {
        // El plugin no pide el permiso de cámara por sí solo: si no se concede
        // antes, `scan()` lanza "No permission to use camera".
        let permission: string = await checkPermissions();
        if (permission === 'prompt' || permission === 'prompt-with-rationale') {
          permission = await requestPermissions();
        }
        if (permission !== 'granted') {
          if (cancelled) return;
          setShowSettings(true);
          setError(
            permission === 'denied'
              ? `Permiso de cámara denegado. ${CAMERA_SETTINGS_HINT}`
              : `Android necesita permiso para usar la cámara. Pulsa «Reintentar» y acepta el aviso. ${CAMERA_SETTINGS_HINT}`,
          );
          return;
        }

        if (!cancelled) setRunning(true);
        const result = await scan({ windowed: true, formats: NATIVE_FORMATS });
        if (result?.content) {
          emit(result.content);
        } else if (!cancelled) {
          setError('El lector no devolvió ningún código. Acércalo al envase y vuelve a intentarlo.');
        }
      } catch (e) {
        if (cancelled) return;
        const message = errorText(e);
        setRunning(false);
        if (/cancel/i.test(message)) {
          setError('Escaneo cancelado. Pulsa «Reintentar» para abrir la cámara otra vez.');
          return;
        }
        // Errores nativos sin mensaje útil (por ejemplo el NPE de la vista previa
        // que lanzaban versiones antiguas del plugin). Mejor un aviso claro que
        // el texto de Java.
        if (/null object reference|getClass\(\)|Something went wrong/i.test(message)) {
          setShowSettings(false);
          setError(
            'La cámara no pudo abrirse en este dispositivo. Cierra la app, vuelve a abrirla y prueba otra vez.',
          );
          return;
        }
        const permissionProblem = /permission|denied|camera|permiso/i.test(message);
        setShowSettings(permissionProblem);
        setError(
          permissionProblem
            ? `No se pudo abrir la cámara: ${message}. ${CAMERA_SETTINGS_HINT}`
            : `No se pudo abrir la cámara: ${message}`,
        );
      }
    };

    const startWeb = async () => {
      try {
        if (!videoRef.current) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result) emit(result.getText());
        });
        if (!cancelled) setRunning(true);
      } catch (e) {
        if (!cancelled) {
          const message = errorText(e);
          const permissionProblem = /permission|denied|notallowed|notfound/i.test(message);
          setShowSettings(false);
          setError(
            permissionProblem
              ? `No se pudo abrir la cámara: ${message}. Revisa el permiso de cámara del navegador y que no haya otra aplicación usándola.`
              : `No se pudo abrir la cámara: ${message}`,
          );
        }
      }
    };

    if (mobile) void startNative();
    else void startWeb();

    return () => {
      cancelled = true;
      controls?.stop();
      // Al cerrar el modal hay que soltar la cámara nativa: si no, `scan()`
      // queda pendiente y la vista previa sigue abierta por detrás.
      if (mobile) void cancel().catch(() => undefined);
    };
  }, [mobile, attempt]);

  const openSettings = async () => {
    try {
      await openAppSettings();
    } catch (e) {
      setError(
        `No se pudieron abrir los ajustes (${errorText(e)}). ${CAMERA_SETTINGS_HINT}`,
      );
    }
  };

  return (
    <div className="barcode-scanner">
      {!mobile && (
        <video
          ref={videoRef}
          className="barcode-video"
          muted
          playsInline
          aria-label="Vista de la cámara para escanear"
        />
      )}
      {mobile && running && !error && (
        <div className="notice notice-info">
          <span>La cámara nativa está abierta. Apunta al código de barras del envase.</span>
        </div>
      )}
      {error && (
        <div className="notice notice-warn">
          <span>{error}</span>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Reintentar
            </button>
            {mobile && showSettings && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={openSettings}>
                Abrir ajustes
              </button>
            )}
          </div>
        </div>
      )}
      {!running && !error && !mobile && <span className="hint">Iniciando cámara…</span>}
      <div className="row between wrap" style={{ marginTop: 8 }}>
        <span className="hint">EAN-13, EAN-8, UPC-A, UPC-E, Code 128 o QR.</span>
        {onClose && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
