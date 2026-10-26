import React, { useState } from 'react';
import { appendEvent, newEvent, VaultEvent } from './vault';

interface Mesocycle { id: string; name: string; weeks: number; deload: boolean; start: string; }
interface Props { deviceId: string; events: VaultEvent[]; onRefresh: () => void; }

export default function MesocyclesView({ deviceId, events, onRefresh }: Props) {
  const mesos = events.filter(e => e.kind === 'mesocycle.saved').map(e => e.payload as Mesocycle);
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [deload, setDeload] = useState(true);
  const [start, setStart] = useState(new Date().toISOString().slice(0,10));
  const save = async () => {
    if (!name.trim()) return;
    const m: Mesocycle = { id: crypto.randomUUID(), name: name.trim(), weeks, deload, start };
    await appendEvent(newEvent(deviceId, 'mesocycle.saved', m));
    setName('');
    await onRefresh();
  };
  return (
    <div>
      <h1>Mesociclos</h1>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre" />
        <label>Semanas <input type="number" value={weeks} onChange={e=>setWeeks(Number(e.target.value))} style={{ width:60 }} /></label>
        <label><input type="checkbox" checked={deload} onChange={e=>setDeload(e.target.checked)} /> Semana de descarga</label>
        <input type="date" value={start} onChange={e=>setStart(e.target.value)} />
        <button onClick={save} style={{ padding:'0.4rem 0.8rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Guardar</button>
      </div>
      {mesos.length === 0 && <p style={{ opacity:.6 }}>Sin mesociclos.</p>}
      {mesos.slice().reverse().map(m => (
        <div key={m.id} style={{ background:'#f1f5f9', color:'#0f172a', padding:'0.8rem', borderRadius:6, marginBottom:8 }}>
          <strong>{m.name}</strong> — {m.weeks} semanas {m.deload ? '(con descarga)' : ''} — inicio {m.start}
        </div>
      ))}
    </div>
  );
}