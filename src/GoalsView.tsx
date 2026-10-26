import React, { useState } from 'react';
import { appendEvent, newEvent, VaultEvent } from './vault';

interface Goal { id: string; type: string; target: number; date: string; note: string; }
interface Props { deviceId: string; events: VaultEvent[]; onRefresh: () => void; }

export default function GoalsView({ deviceId, events, onRefresh }: Props) {
  const goals: Goal[] = events.filter(e => e.kind === 'goal.saved').map(e => e.payload as Goal);
  const [type, setType] = useState('peso');
  const [target, setTarget] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [note, setNote] = useState('');
  const save = async () => {
    const g: Goal = { id: crypto.randomUUID(), type, target, date, note };
    await appendEvent(newEvent(deviceId, 'goal.saved', g));
    setNote('');
    await onRefresh();
  };
  return (
    <div>
      <h1>Objetivos</h1>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <select value={type} onChange={e=>setType(e.target.value)} style={{ padding:'0.4rem' }}>
          <option value="peso">Peso (kg)</option>
          <option value="grasa">% grasa</option>
          <option value="medida">Medida (cm)</option>
          <option value="sesiones">Sesiones/semana</option>
        </select>
        <input type="number" value={target} onChange={e=>setTarget(Number(e.target.value))} placeholder="objetivo" style={{ width:80 }} />
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="nota" />
        <button onClick={save} style={{ padding:'0.4rem 0.8rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Guardar</button>
      </div>
      {goals.length === 0 && <p style={{ opacity:.6 }}>Sin objetivos.</p>}
      {goals.slice().reverse().map(g => (
        <div key={g.id} style={{ background:'#f1f5f9', color:'#0f172a', padding:'0.8rem', borderRadius:6, marginBottom:8 }}>
          <strong>{g.type}</strong>: {g.target} para {g.date} {g.note && `— ${g.note}`}
        </div>
      ))}
    </div>
  );
}