import React, { useState } from 'react';
import { appendEvent, newEvent, VaultEvent } from './vault';

interface Injury { id: string; zone: string; intensity: number; date: string; status: string; notes: string; }
interface Props { deviceId: string; events: VaultEvent[]; onRefresh: () => void; }

const ZONES = ['cuello','hombro','espalda alta','espalda baja','codo','muñeca','cadera','rodilla','tobillo','muslo','pantorrilla'];

export default function InjuriesView({ deviceId, events, onRefresh }: Props) {
  const injuries: Injury[] = events.filter(e => e.kind === 'injury.saved').map(e => e.payload as Injury);
  const [zone, setZone] = useState(ZONES[0]);
  const [intensity, setIntensity] = useState(5);
  const [status, setStatus] = useState('activa');
  const [notes, setNotes] = useState('');
  const save = async () => {
    const inj: Injury = { id: crypto.randomUUID(), zone, intensity, date: new Date().toISOString().slice(0,10), status, notes };
    await appendEvent(newEvent(deviceId, 'injury.saved', inj));
    setNotes('');
    await onRefresh();
  };
  return (
    <div>
      <h1>Lesiones y molestias</h1>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <select value={zone} onChange={e=>setZone(e.target.value)} style={{ padding:'0.4rem' }}>
          {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <label>Intensidad (0-10) <input type="range" min={0} max={10} value={intensity} onChange={e=>setIntensity(Number(e.target.value))} /> {intensity}</label>
        <select value={status} onChange={e=>setStatus(e.target.value)} style={{ padding:'0.4rem' }}>
          <option value="activa">Activa</option>
          <option value="recuperacion">En recuperación</option>
          <option value="resuelta">Resuelta</option>
        </select>
        <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notas" style={{ padding:'0.4rem' }} />
        <button onClick={save} style={{ padding:'0.4rem 0.8rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Guardar</button>
      </div>
      {injuries.length === 0 && <p style={{ opacity:.6 }}>Sin lesiones registradas.</p>}
      {injuries.slice().reverse().map(inj => (
        <div key={inj.id} style={{ background:'#f1f5f9', color:'#0f172a', padding:'0.8rem', borderRadius:6, marginBottom:8 }}>
          <strong>{inj.zone}</strong> — intensidad {inj.intensity}/10 — {inj.status} — {inj.date}
          {inj.notes && <p style={{ margin:'0.3rem 0 0 0', fontSize:13 }}>{inj.notes}</p>}
        </div>
      ))}
      <p style={{ fontSize:11, opacity:.6, marginTop:12 }}>Los ejercicios que cargan una zona con molestia activa mostrarán aviso al planificar. (Heurística, no sustituye consejo médico.)</p>
    </div>
  );
}