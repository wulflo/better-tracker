import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { appendEvent, getDeviceId, getVaultPath, listEvents, newEvent, selectVault, VaultEvent } from './vault';

interface AppInfo { version: string; commit: string; build_date: string; vault_schema_version: number; }
interface Exercise { id: string; name: string; muscle: string; type: string; }

function reduceExercises(events: VaultEvent[]): Exercise[] {
  const map = new Map<string, Exercise>();
  for (const ev of events) {
    if (ev.kind === 'exercise.upsert') {
      const ex = ev.payload as Exercise;
      map.set(ex.id, ex);
    } else if (ev.kind === 'exercise.delete') {
      map.delete(ev.payload.id);
    }
  }
  return Array.from(map.values());
}

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [vault, setVault] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('');
  const [type, setType] = useState('fuerza');

  const refresh = async () => {
    const evs = await listEvents();
    setEvents(evs);
  };

  useEffect(() => {
    invoke<AppInfo>('get_app_info').then(setInfo).catch(console.error);
    getVaultPath().then(setVault).catch(console.error);
    getDeviceId().then(setDeviceId).catch(console.error);
  }, []);

  useEffect(() => {
    if (vault) refresh().catch(console.error);
  }, [vault]);

  const chooseVault = async () => {
    try { setVault(await selectVault()); } catch (e) { console.error(e); }
  };

  const addExercise = async () => {
    if (!name.trim()) return;
    const ex: Exercise = { id: crypto.randomUUID(), name: name.trim(), muscle: muscle.trim(), type };
    await appendEvent(newEvent(deviceId, 'exercise.upsert', ex));
    setName(''); setMuscle('');
    await refresh();
  };

  const deleteExercise = async (id: string) => {
    await appendEvent(newEvent(deviceId, 'exercise.delete', { id }));
    await refresh();
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

  return (
    <div style={{ display:'flex', height:'100vh', fontFamily:'system-ui' }}>
      <aside style={{ width:220, background:'#0f172a', color:'#e2e8f0', padding:'1rem' }}>
        <h2>Better Tracker</h2>
        <p style={{ fontSize:12, opacity:.7 }}>Bóveda: {vault}</p>
        <p style={{ fontSize:12, opacity:.7 }}>Dispositivo: {deviceId}</p>
        <p style={{ fontSize:12, opacity:.7 }}>Eventos: {events.length}</p>
      </aside>
      <main style={{ flex:1, padding:'2rem', overflow:'auto' }}>
        <h1>Ejercicios</h1>
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre" />
          <input value={muscle} onChange={e=>setMuscle(e.target.value)} placeholder="Grupo muscular" />
          <select value={type} onChange={e=>setType(e.target.value)}>
            <option value="fuerza">Fuerza</option>
            <option value="cardio">Cardio</option>
            <option value="movilidad">Movilidad</option>
            <option value="calentamiento">Calentamiento</option>
          </select>
          <button onClick={addExercise} style={{ padding:'0.4rem 0.8rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Añadir</button>
        </div>
        {exercises.length === 0 && <p style={{ opacity:.6 }}>Sin ejercicios. Añade el primero.</p>}
        <ul style={{ listStyle:'none', padding:0 }}>
          {exercises.map(ex => (
            <li key={ex.id} style={{ padding:'0.6rem', background:'#f1f5f9', color:'#0f172a', borderRadius:6, marginBottom:8, display:'flex', justifyContent:'space-between' }}>
              <span><strong>{ex.name}</strong> — {ex.muscle} ({ex.type})</span>
              <button onClick={() => deleteExercise(ex.id)} style={{ background:'#ef4444', color:'white', border:'none', borderRadius:4, cursor:'pointer' }}>Eliminar</button>
            </li>
          ))}
        </ul>
        {info && (
          <section style={{ marginTop:'2rem', padding:'1rem', background:'#f1f5f9', borderRadius:8, color:'#0f172a' }}>
            <h2>Acerca de</h2>
            <p>Versión: {info.version}</p>
            <p>Commit: {info.commit}</p>
            <p>Compilado: {info.build_date}</p>
          </section>
        )}
      </main>
    </div>
  );
}