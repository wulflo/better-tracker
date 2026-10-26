import React, { useState } from 'react';
import { appendEvent, newEvent, VaultEvent } from './vault';

interface Exercise { id: string; name: string; }
interface RoutineExercise { exerciseId: string; sets: number; reps: number; load: number; rest: number; }
interface Routine { id: string; name: string; exercises: RoutineExercise[]; }

interface Props { deviceId: string; exercises: Exercise[]; events: VaultEvent[]; onRefresh: () => void; }

export default function RoutinesView({ deviceId, exercises, events, onRefresh }: Props) {
  const routines: Routine[] = events.filter(e => e.kind === 'routine.saved').map(e => e.payload as Routine);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [items, setItems] = useState<RoutineExercise[]>([]);

  const addExercise = () => {
    if (!selected) return;
    setItems([...items, { exerciseId: selected, sets: 3, reps: 10, load: 0, rest: 90 }]);
    setSelected('');
  };
  const updateItem = (i: number, field: keyof RoutineExercise, val: number) => {
    const copy = [...items];
    (copy[i] as any)[field] = val;
    setItems(copy);
  };
  const removeItem = (i: number) => { const copy = [...items]; copy.splice(i, 1); setItems(copy); };
  const save = async () => {
    if (!name.trim() || items.length === 0) return;
    const r: Routine = { id: crypto.randomUUID(), name: name.trim(), exercises: items };
    await appendEvent(newEvent(deviceId, 'routine.saved', r));
    setName(''); setItems([]);
    await onRefresh();
  };
  const del = async (id: string) => {
    await appendEvent(newEvent(deviceId, 'routine.deleted', { id }));
    await onRefresh();
  };

  return (
    <div>
      <h1>Rutinas</h1>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre rutina" style={{ padding:'0.4rem' }} />
        <select value={selected} onChange={e=>setSelected(e.target.value)} style={{ padding:'0.4rem' }}>
          <option value="">-- ejercicio --</option>
          {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
        </select>
        <button onClick={addExercise} style={{ padding:'0.4rem 0.8rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Añadir ejercicio</button>
      </div>
      {items.map((it, i) => {
        const ex = exercises.find(e => e.id === it.exerciseId);
        return (
          <div key={i} style={{ background:'#f1f5f9', color:'#0f172a', padding:'0.8rem', borderRadius:6, marginBottom:8 }}>
            <strong>{ex?.name}</strong>
            <div style={{ display:'flex', gap:8, marginTop:4, flexWrap:'wrap' }}>
              <label>Series <input type="number" value={it.sets} onChange={e=>updateItem(i,'sets',Number(e.target.value))} style={{ width:50 }} /></label>
              <label>Reps <input type="number" value={it.reps} onChange={e=>updateItem(i,'reps',Number(e.target.value))} style={{ width:50 }} /></label>
              <label>Carga kg <input type="number" value={it.load} onChange={e=>updateItem(i,'load',Number(e.target.value))} style={{ width:60 }} /></label>
              <label>Descanso s <input type="number" value={it.rest} onChange={e=>updateItem(i,'rest',Number(e.target.value))} style={{ width:60 }} /></label>
              <button onClick={()=>removeItem(i)}>x</button>
            </div>
          </div>
        );
      })}
      {items.length > 0 && <button onClick={save} style={{ padding:'0.6rem 1.2rem', background:'#22c55e', border:'none', borderRadius:6, cursor:'pointer', color:'white', marginBottom:16 }}>Guardar rutina</button>}
      <h2>Rutinas guardadas</h2>
      {routines.length === 0 && <p style={{ opacity:.6 }}>Sin rutinas.</p>}
      {routines.map(r => (
        <div key={r.id} style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6, marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <strong>{r.name}</strong>
            <button onClick={()=>del(r.id)} style={{ background:'#ef4444', color:'white', border:'none', borderRadius:4, cursor:'pointer' }}>Eliminar</button>
          </div>
          <ul style={{ margin:'0.5rem 0 0 0' }}>
            {r.exercises.map((e,i) => {
              const ex = exercises.find(x => x.id === e.exerciseId);
              return <li key={i}>{ex?.name}: {e.sets}x{e.reps} @ {e.load}kg, descanso {e.rest}s</li>;
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}