import React, { useState, useEffect, useRef } from 'react';
import { appendEvent, newEvent, VaultEvent } from './vault';

interface Exercise { id: string; name: string; }
interface Routine { id: string; name: string; exercises: { exerciseId: string; sets: number; reps: number; load: number; rest: number }[]; }
interface SetEntry { reps: number; weight: number; rpe: number; }

interface Props { deviceId: string; exercises: Exercise[]; events: VaultEvent[]; onRefresh: () => void; }

export default function SessionView({ deviceId, exercises, events, onRefresh }: Props) {
  const routines: Routine[] = events.filter(e => e.kind === 'routine.saved').map(e => e.payload as Routine);
  const [selectedRoutine, setSelectedRoutine] = useState('');
  const [entries, setEntries] = useState<{ exerciseId: string; sets: SetEntry[] }[]>([]);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const timerRef = useRef<any>(null);
  const restRef = useRef<any>(null);

  useEffect(() => {
    if (sessionStart) {
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - sessionStart) / 1000)), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [sessionStart]);

  const startSession = () => {
    const r = routines.find(x => x.id === selectedRoutine);
    if (r) {
      setEntries(r.exercises.map(e => ({ exerciseId: e.exerciseId, sets: Array.from({ length: e.sets }, () => ({ reps: e.reps, weight: e.load, rpe: 7 })) })));
    } else {
      setEntries([]);
    }
    setSessionStart(Date.now());
    setElapsed(0);
  };

  const startRest = (seconds: number) => {
    clearInterval(restRef.current);
    setRestLeft(seconds);
    restRef.current = setInterval(() => {
      setRestLeft(prev => {
        if (prev <= 1) { clearInterval(restRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const updateSet = (ei: number, si: number, field: keyof SetEntry, val: number) => {
    const copy = [...entries];
    (copy[ei].sets[si] as any)[field] = val;
    setEntries(copy);
  };
  const addSet = (ei: number) => { const copy = [...entries]; copy[ei].sets.push({ reps: 0, weight: 0, rpe: 7 }); setEntries(copy); };
  const addExercise = (id: string) => { setEntries([...entries, { exerciseId: id, sets: [{ reps: 0, weight: 0, rpe: 7 }] }]); };

  const finish = async () => {
    if (sessionStart === null) return;
    const session = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      routineId: selectedRoutine || null,
      duration: elapsed,
      entries,
      rpeSession: 7,
    };
    await appendEvent(newEvent(deviceId, 'session.saved', session));
    clearInterval(timerRef.current);
    setSessionStart(null);
    setEntries([]);
    await onRefresh();
    alert('Sesión guardada');
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div>
      <h1>Sesión en vivo</h1>
      {sessionStart === null ? (
        <div style={{ marginBottom: 16 }}>
          <select value={selectedRoutine} onChange={e => setSelectedRoutine(e.target.value)} style={{ padding: '0.4rem', marginRight: 8 }}>
            <option value="">-- rutina (opcional) --</option>
            {routines.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={startSession} style={{ padding: '0.6rem 1.2rem', background: '#22c55e', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'white' }}>Iniciar sesión</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 24, marginBottom: 16, fontSize: 18 }}>
            <span>Tiempo: {fmt(elapsed)}</span>
            {restLeft > 0 && <span style={{ color: '#ef4444' }}>Descanso: {fmt(restLeft)}</span>}
          </div>
          <div style={{ marginBottom: 12 }}>
            <select onChange={e => { if (e.target.value) addExercise(e.target.value); e.target.value = ''; }} style={{ padding: '0.4rem' }}>
              <option value="">+ Añadir ejercicio</option>
              {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
            </select>
          </div>
          {entries.map((entry, ei) => {
            const ex = exercises.find(e => e.id === entry.exerciseId);
            return (
              <div key={ei} style={{ background: '#f1f5f9', color: '#0f172a', padding: '1rem', borderRadius: 6, marginBottom: 12 }}>
                <strong>{ex?.name}</strong>
                {entry.sets.map((s, si) => (
                  <div key={si} style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                    <span>Serie {si + 1}</span>
                    <input type="number" value={s.reps} onChange={e => updateSet(ei, si, 'reps', Number(e.target.value))} placeholder="reps" style={{ width: 50 }} />
                    <input type="number" value={s.weight} onChange={e => updateSet(ei, si, 'weight', Number(e.target.value))} placeholder="kg" style={{ width: 50 }} />
                    <input type="number" value={s.rpe} onChange={e => updateSet(ei, si, 'rpe', Number(e.target.value))} placeholder="RPE" style={{ width: 50 }} min={1} max={10} />
                    <button onClick={() => startRest(90)}>Descanso 90s</button>
                  </div>
                ))}
                <button onClick={() => addSet(ei)} style={{ marginTop: 6 }}>+ Serie</button>
              </div>
            );
          })}
          <button onClick={finish} style={{ padding: '0.6rem 1.2rem', background: '#22c55e', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'white' }}>Finalizar sesión</button>
        </>
      )}
      <h2 style={{ marginTop: 24 }}>Sesiones guardadas</h2>
      {events.filter(e => e.kind === 'session.saved').length === 0 && <p style={{ opacity: .6 }}>Sin sesiones.</p>}
      {events.filter(e => e.kind === 'session.saved').slice().reverse().map(e => (
        <div key={e.id} style={{ background: '#f1f5f9', color: '#0f172a', padding: '0.8rem', borderRadius: 6, marginBottom: 8 }}>
          <strong>{e.payload.name || 'Sesión'}</strong> — {e.payload.date} — {Math.floor(e.payload.duration / 60)}min
        </div>
      ))}
    </div>
  );
}