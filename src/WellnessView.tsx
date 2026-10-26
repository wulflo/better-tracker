import React, { useState } from 'react';
import { appendEvent, newEvent, VaultEvent } from './vault';

interface Wellness { date: string; sleep: number; energy: number; soreness: number; }
interface Props { deviceId: string; events: VaultEvent[]; onRefresh: () => void; }

export default function WellnessView({ deviceId, events, onRefresh }: Props) {
  const logs: Wellness[] = events.filter(e => e.kind === 'wellness.logged').map(e => e.payload as Wellness);
  const [form, setForm] = useState<Wellness>({ date: new Date().toISOString().slice(0,10), sleep: 7, energy: 5, soreness: 3 });
  const save = async () => {
    await appendEvent(newEvent(deviceId, 'wellness.logged', form));
    await onRefresh();
  };
  return (
    <div>
      <h1>Bienestar y recuperación</h1>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <label>Fecha <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></label>
        <label>Sueño (h) <input type="range" min={0} max={12} step={0.5} value={form.sleep} onChange={e=>setForm({...form,sleep:Number(e.target.value)})} /> {form.sleep}</label>
        <label>Energía (1-10) <input type="range" min={1} max={10} value={form.energy} onChange={e=>setForm({...form,energy:Number(e.target.value)})} /> {form.energy}</label>
        <label>Dolor muscular (1-10) <input type="range" min={1} max={10} value={form.soreness} onChange={e=>setForm({...form,soreness:Number(e.target.value)})} /> {form.soreness}</label>
        <button onClick={save} style={{ padding:'0.4rem 0.8rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Guardar</button>
      </div>
      <h2>Historial</h2>
      {logs.slice().reverse().map((l,i) => (
        <div key={i} style={{ padding:'0.4rem', background:'#f1f5f9', color:'#0f172a', borderRadius:4, marginBottom:4 }}>
          {l.date}: sueño {l.sleep}h, energía {l.energy}/10, dolor {l.soreness}/10
        </div>
      ))}
    </div>
  );
}