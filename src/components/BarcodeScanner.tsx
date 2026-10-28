import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  Format,
  checkPermissions,
  requestPermissions,
  scan,
} from '@tauri-apps/plugin-barcode-scanner';
import { platform } from '@tauri-apps/plugin-os';
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

const NATIVE_FORMATS = [
  Format.EAN13,
  Format.EAN8,
  Format.UPC_A,
  Format.UPC_E,
  Format.Code128,
  Format.QRCode,
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

export default function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef(onResult);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mobile = nativeMobile();

  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let cancelled = false;
    let controls: { stop: () => void } | null = null;
    setError(null);
    setRunning(false);

    const emit = (code: string) => {
      if (cancelled) return;
      resultRef.current(code);
      setRunning(false);
    };

    const startNative = async () => {
      try {
        // El plugin no pide el permiso de cámara por sí solo: si no se concede
        // primero, `scan()` falla con un error genérico en Android.
        let permission = await checkPermissions();
        if (permission !== 'granted') {
          permission = await requestPermissions();
        }
        if (permission !== 'granted') {
          if (!cancelled) {
            setError(
              permission === 'denied'
                ? 'Permiso de cámara denegado. Actívalo en Ajustes de Android → Aplicaciones → Better Tracker → Permisos → Cámara y vuelve a intentarlo.'
                : 'Android necesita permiso para usar la cámara. Acepta el aviso y vuelve a intentarlo.',
            );
          }
          return;
        }
        const result = await scan({ windowed: true, formats: NATIVE_FORMATS });
        if (result?.content) emit(result.content);
      } catch (e) {
        const message = String(e);
        if (cancelled) return;
        if (/cancel/i.test(message)) {
          setError('Escaneo cancelado.');
        } else if (/permission|denied|camera/i.test(message)) {
          setError(
            `No se pudo abrir la cámara: ${message}. Revisa el permiso de cámara en Ajustes de Android.`,
          );
        } else {
          setError(`No se pudo abrir la cámara: ${message}`);
        }
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
        if (!cancelled) setError(`No se pudo abrir la cámara: ${String(e)}`);
      }
    };

    if (mobile) void startNative();
    else void startWeb();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [mobile, attempt]);

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
      {mobile && running === false && !error && (
        <div className="notice notice-info">
          <span>La cámara nativa está abierta. Apunta al código de barras del envase.</span>
        </div>
      )}
      {error && (
        <div className="notice notice-warn">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </button>
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
