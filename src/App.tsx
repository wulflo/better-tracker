import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { appendEvent, getDeviceId, getVaultPath, listEvents, newEvent, selectVault, VaultEvent } from './vault';

interface AppInfo { version: string; commit: string; build_date: string; vault_schema_version: number; }
interface Exercise { id: string; name: string; muscle: string; type: string; }
interface SetEntry { reps: number; weight: number; }
interface WorkoutEntry { exerciseId: string; sets: SetEntry[]; }
interface Workout { id: string; date: string; name: string; entries: WorkoutEntry[]; }

function reduceExercises(events: VaultEvent[]): Exercise[] {
  const map = new Map<string, Exercise>();
  for (const ev of events) {
    if (ev.kind === 'exercise.upsert') map.set((ev.payload as Exercise).id, ev.payload as Exercise);
    else if (ev.kind === 'exercise.delete') map.delete(ev.payload.id);
  }
  return Array.from(map.values());
}
function reduceWorkouts(events: VaultEvent[]): Workout[] {
  const list: Workout[] = [];
  for (const ev of events) if (ev.kind === 'workout.saved') list.push(ev.payload as Workout);
  return list;
}

type View = 'exercises' | 'workout' | 'history' | 'about';

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [vault, setVault] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [view, setView] = useState<View>('exercises');

  // exercise form
  const [exName, setExName] = useState('');
  const [exMuscle, setExMuscle] = useState('');
  const [exType, setExType] = useState('fuerza');

  // workout form
  const [woName, setWoName] = useState('');
  const [woEntries, setWoEntries] = useState<WorkoutEntry[]>([]);
  const [selectedEx, setSelectedEx] = useState('');

  const refresh = async () => setEvents(await listEvents());

  useEffect(() => {
    invoke<AppInfo>('get_app_info').then(setInfo).catch(console.error);
    getVaultPath().then(setVault).catch(console.error);
    getDeviceId().then(setDeviceId).catch(console.error);
  }, []);
  useEffect(() => { if (vault) refresh().catch(console.error); }, [vault]);

  const chooseVault = async () => { try { setVault(await selectVault()); } catch (e) { console.error(e); } };

  const addExercise = async () => {
    if (!exName.trim()) return;
    const ex: Exercise = { id: crypto.randomUUID(), name: exName.trim(), muscle: exMuscle.trim(), type: exType };
    await appendEvent(newEvent(deviceId, 'exercise.upsert', ex));
    setExName(''); setExMuscle('');
    await refresh();
  };
  const deleteExercise = async (id: string) => {
    await appendEvent(newEvent(deviceId, 'exercise.delete', { id }));
    await refresh();
  };

  const addEntry = () => {
    if (!selectedEx) return;
    setWoEntries([...woEntries, { exerciseId: selectedEx, sets: [{ reps: 0, weight: 0 }] }]);
  };
  const addSet = (idx: number) => {
    const copy = [...woEntries];
    copy[idx].sets.push({ reps: 0, weight: 0 });
    setWoEntries(copy);
  };
  const updateSet = (ei: number, si: number, field: 'reps'|'weight', val: number) => {
    const copy = [...woEntries];
    copy[ei].sets[si][field] = val;
    setWoEntries(copy);
  };
  const removeSet = (ei: number, si: number) => {
    const copy = [...woEntries];
    copy[ei].sets.splice(si, 1);
    setWoEntries(copy);
  };
  const saveWorkout = async () => {
    if (woEntries.length === 0) return;
    const w: Workout = { id: crypto.randomUUID(), date: new Date().toISOString().slice(0,10), name: woName.trim() || 'Entrenamiento', entries: woEntries };
    await appendEvent(newEvent(deviceId, 'workout.saved', w));
    setWoEntries([]); setWoName('');
    await refresh();
    setView('history');
  };

  if (!vault) {
    return (
      <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui', background:'#0f172a', color:'#e2e8f0' }}>
        <div style={{ textAlign:'center', maxWidth:480 }}>
          <h1>Better Tracker</h1>
          <p>Elige o crea una carpeta para tu bóveda de datos.</p>
          <button onClick={chooseVault} style={{ padding:'0.6rem 1.2rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Seleccionar bóveda</button>
          <p style={{ marginTop:'1rem', fontSize:12, opacity:.7 }}>Dispositivo: {deviceId}</p>
        </div>
      </div>
    );
  }

  const exercises = reduceExercises(events);
  const workouts = reduceWorkouts(events);

  const navBtn = (v: View, label: string) => (
    <button onClick={() => setView(v)} style={{ display:'block', width:'100%', textAlign:'left', padding:'0.5rem', margin:'0.2rem 0', background: view===v ? '#38bdf8' : 'transparent', color: view===v ? '#0f172a' : '#e2e8f0', border:'none', borderRadius:4, cursor:'pointer' }}>{label}</button>
  );

  return (
    <div style={{ display:'flex', height:'100vh', fontFamily:'system-ui' }}>
      <aside style={{ width:220, background:'#0f172a', color:'#e2e8f0', padding:'1rem' }}>
        <h2>Better Tracker</h2>
        {navBtn('exercises','Ejercicios')}
        {navBtn('workout','Entrenar')}
        {navBtn('history','Historial')}
        {navBtn('about','Acerca de')}
        <p style={{ fontSize:11, opacity:.6, marginTop:'1rem' }}>Eventos: {events.length}</p>
      </aside>
      <main style={{ flex:1, padding:'2rem', overflow:'auto' }}>
        {view === 'exercises' && (
          <>
            <h1>Ejercicios</h1>
            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
              <input value={exName} onChange={e=>setExName(e.target.value)} placeholder="Nombre" />
              <input value={exMuscle} onChange={e=>setExMuscle(e.target.value)} placeholder="Grupo muscular" />
              <select value={exType} onChange={e=>setExType(e.target.value)}>
                <option value="fuerza">Fuerza</option>
                <option value="cardio">Cardio</option>
                <option value="movilidad">Movilidad</option>
                <option value="calentamiento">Calentamiento</option>
              </select>
              <button onClick={addExercise} style={{ padding:'0.4rem 0.8rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Añadir</button>
            </div>
            {exercises.length === 0 && <p style={{ opacity:.6 }}>Sin ejercicios.</p>}
            <ul style={{ listStyle:'none', padding:0 }}>
              {exercises.map(ex => (
                <li key={ex.id} style={{ padding:'0.6rem', background:'#f1f5f9', color:'#0f172a', borderRadius:6, marginBottom:8, display:'flex', justifyContent:'space-between' }}>
                  <span><strong>{ex.name}</strong> — {ex.muscle} ({ex.type})</span>
                  <button onClick={() => deleteExercise(ex.id)} style={{ background:'#ef4444', color:'white', border:'none', borderRadius:4, cursor:'pointer' }}>Eliminar</button>
                </li>
              ))}
            </ul>
          </>
        )}
        {view === 'workout' && (
          <>
            <h1>Entrenamiento</h1>
            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
              <input value={woName} onChange={e=>setWoName(e.target.value)} placeholder="Nombre del entrenamiento" />
              <select value={selectedEx} onChange={e=>setSelectedEx(e.target.value)}>
                <option value="">-- ejercicio --</option>
                {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
              </select>
              <button onClick={addEntry} style={{ padding:'0.4rem 0.8rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Añadir ejercicio</button>
            </div>
            {woEntries.map((entry, ei) => {
              const ex = exercises.find(e => e.id === entry.exerciseId);
              return (
                <div key={ei} style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6, marginBottom:12 }}>
                  <strong>{ex?.name}</strong>
                  {entry.sets.map((s, si) => (
                    <div key={si} style={{ display:'flex', gap:8, marginTop:6 }}>
                      <span>Serie {si+1}</span>
                      <input type="number" value={s.reps} onChange={e=>updateSet(ei,si,'reps',Number(e.target.value))} placeholder="reps" style={{ width:60 }} />
                      <input type="number" value={s.weight} onChange={e=>updateSet(ei,si,'weight',Number(e.target.value))} placeholder="kg" style={{ width:60 }} />
                      <button onClick={()=>removeSet(ei,si)}>x</button>
                    </div>
                  ))}
                  <button onClick={()=>addSet(ei)} style={{ marginTop:6 }}>+ Serie</button>
                </div>
              );
            })}
            <button onClick={saveWorkout} style={{ padding:'0.6rem 1.2rem', background:'#22c55e', border:'none', borderRadius:6, cursor:'pointer', color:'white' }}>Guardar entrenamiento</button>
          </>
        )}
        {view === 'history' && (
          <>
            <h1>Historial</h1>
            {workouts.length === 0 && <p style={{ opacity:.6 }}>Sin entrenamientos.</p>}
            {workouts.slice().reverse().map(w => (
              <div key={w.id} style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6, marginBottom:12 }}>
                <strong>{w.name}</strong> <span style={{ opacity:.6 }}>({w.date})</span>
                <ul>
                  {w.entries.map((e, i) => {
                    const ex = exercises.find(x => x.id === e.exerciseId);
                    return <li key={i}>{ex?.name}: {e.sets.map(s=>`${s.reps}x${s.weight}kg`).join(', ')}</li>;
                  })}
                </ul>
              </div>
            ))}
          </>
        )}
        {view === 'about' && info && (
          <>
            <h1>Acerca de</h1>
            <p>Versión: {info.version}</p>
            <p>Commit: {info.commit}</p>
            <p>Compilado: {info.build_date}</p>
            <p>Esquema de bóveda: {info.vault_schema_version}</p>
          </>
        )}
      </main>
    </div>
  );
}