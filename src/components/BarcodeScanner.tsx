import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  Format,
  checkPermissions,
  requestPermissions,
  scan,
} from '@tauri-apps/plugin-barcode-scanner';
import { isTauri } from '../vault';

interface Props {
  onResult: (code: string) => void;
  onClose?: () => void;
  /** `product` acepta EAN/UPC/Code128; `qr` solo QR (emparejamiento). */
  kind?: 'product' | 'qr';
}

/** Códigos de barras de producto, no solo QR. */
const ZXING_PRODUCT_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.QR_CODE,
];

const ZXING_QR_FORMATS = [BarcodeFormat.QR_CODE];

const NATIVE_PRODUCT_FORMATS = [
  Format.EAN13,
  Format.EAN8,
  Format.UPC_A,
  Format.UPC_E,
  Format.Code128,
  Format.QRCode,
];

const NATIVE_QR_FORMATS = [Format.QRCode];

function nativeMobile(): boolean {
  if (!isTauri() || typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function BarcodeScanner({ onResult, onClose, kind = 'product' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef(onResult);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mobile = nativeMobile();
  const zxingFormats = kind === 'qr' ? ZXING_QR_FORMATS : ZXING_PRODUCT_FORMATS;
  const nativeFormats = kind === 'qr' ? NATIVE_QR_FORMATS : NATIVE_PRODUCT_FORMATS;

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
            setError('Permiso de cámara denegado. Actívalo en los ajustes de la app para escanear códigos.');
          }
          return;
        }
        const result = await scan({ windowed: true, formats: nativeFormats });
        if (result?.content) emit(result.content);
      } catch (e) {
        const message = String(e);
        if (!cancelled) {
          setError(/cancel/i.test(message) ? 'Escaneo cancelado.' : `No se pudo abrir la cámara: ${message}`);
        }
      }
    };

    const startWeb = async () => {
      try {
        if (!videoRef.current) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, zxingFormats);
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
  }, [mobile, attempt, kind]);

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
          <span>
            {kind === 'qr'
              ? 'La cámara nativa está abierta. Apunta al QR de emparejamiento del otro dispositivo.'
              : 'La cámara nativa está abierta. Apunta al código de barras del envase.'}
          </span>
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
        <span className="hint">
          {kind === 'qr' ? 'Solo códigos QR de emparejamiento.' : 'EAN-13, EAN-8, UPC-A, UPC-E, Code 128 o QR.'}
        </span>
        {onClose && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
