import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

type Tone = 'success' | 'error' | 'info';

/* ------------------------------------------------------------------ */
/* Aviso de fin de descanso: pitido + vibración                        */
/* ------------------------------------------------------------------ */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

/** Prepara el audio dentro de un gesto del usuario (Android bloquea el resto). */
export function primeTimerAlarm(): void {
  const context = getAudioContext();
  if (context?.state === 'suspended') void context.resume();
}

/** Pitido triple y vibración; se usa al terminar un descanso. */
export function timerAlarm(): void {
  primeTimerAlarm();
  const context = getAudioContext();
  if (context) {
    const now = context.currentTime;
    [0, 0.28, 0.56].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = index === 2 ? 1046 : 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.24);
    });
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate([200, 120, 200]);
  }
}

/* ------------------------------------------------------------------ */
/* Temporizador de descanso independiente                              */
/* ------------------------------------------------------------------ */

const PRESETS = [30, 60, 90, 120, 180];

function clock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function RestTimer({ notify }: { notify: (message: string, tone?: Tone) => void }) {
  const [duration, setDuration] = useState(90);
  const [remaining, setRemaining] = useState(90);
  const [running, setRunning] = useState(false);
  const endsAt = useRef<number | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil(((endsAt.current ?? Date.now()) - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        setRunning(false);
        endsAt.current = null;
        if (!finished.current) {
          finished.current = true;
          timerAlarm();
          notify('Descanso terminado. A por la siguiente serie.', 'success');
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running, notify]);

  const start = () => {
    const seconds = remaining > 0 ? remaining : duration;
    endsAt.current = Date.now() + seconds * 1000;
    finished.current = false;
    primeTimerAlarm();
    setRemaining(seconds);
    setRunning(true);
  };

  const pause = () => {
    const left = Math.max(0, Math.ceil(((endsAt.current ?? Date.now()) - Date.now()) / 1000));
    endsAt.current = null;
    setRemaining(left);
    setRunning(false);
  };

  const reset = () => {
    endsAt.current = null;
    finished.current = false;
    setRunning(false);
    setRemaining(duration);
  };

  const chooseDuration = (seconds: number) => {
    setDuration(seconds);
    if (!running) setRemaining(seconds);
  };

  const adjust = (delta: number) => {
    const next = Math.max(0, remaining + delta);
    if (running && endsAt.current !== null) {
      endsAt.current = Math.max(Date.now(), endsAt.current + delta * 1000);
    }
    if (next > 0) finished.current = false;
    setRemaining(next);
  };

  const pct = duration > 0 ? Math.max(0, Math.min(100, Math.round((remaining / duration) * 100))) : 0;
  const label = running
    ? 'Descanso en curso'
    : remaining <= 0
      ? 'Descanso terminado'
      : remaining < duration
        ? 'En pausa'
        : 'Listo para empezar';

  return (
    <div className="rest-timer">
      <div className="rest-timer-display">
        <strong aria-live="off">{clock(remaining)}</strong>
        <span>{label}</span>
      </div>
      <div className="rest-timer-track" aria-hidden="true">
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="rest-timer-presets" role="group" aria-label="Duración del descanso">
        {PRESETS.map((seconds) => (
          <button
            key={seconds}
            type="button"
            className={`chip ${duration === seconds ? 'active' : ''}`}
            onClick={() => chooseDuration(seconds)}
            disabled={running}
          >
            {seconds < 60 ? `${seconds}s` : `${seconds / 60} min`}
          </button>
        ))}
      </div>
      <div className="row wrap">
        {running ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={pause}>
            <Icon name="pause" size={14} /> Pausar
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={start}>
            <Icon name="play" size={14} /> {remaining > 0 && remaining < duration ? 'Reanudar' : 'Iniciar'}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
          <Icon name="refresh" size={14} /> Reiniciar
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => adjust(15)}>
          +15 s
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => adjust(-15)}>
          −15 s
        </button>
      </div>
      <p className="hint">
        Sirve para descansar entre series o para cualquier intervalo. Al terminar suena y vibra.
        Se mantiene activo mientras estés en Entrenamiento; la sesión en vivo tiene su propio
        temporizador con pausa y aviso.
      </p>
    </div>
  );
}
