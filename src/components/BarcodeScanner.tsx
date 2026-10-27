import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

export default function BarcodeScanner({ onResult }: { onResult: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    let controls: any = null;
    const start = async () => {
      try {
        if (!videoRef.current) return;
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
          if (result) {
            onResult(result.getText());
            if (controls) controls.stop();
            setRunning(false);
          }
        });
        setRunning(true);
      } catch (e) {
        setError(String(e));
      }
    };
    void start();
    return () => {
      if (controls) controls.stop();
      readerRef.current = null;
    };
  }, [onResult]);

  return (
    <div className="settings-block">
      <video ref={videoRef} style={{ width: '100%', maxWidth: 480, borderRadius: 8 }} muted playsInline />
      {error && <div className="notice notice-warn">{error}</div>}
      {!running && !error && <span className="hint">Iniciando cámara…</span>}
    </div>
  );
}
