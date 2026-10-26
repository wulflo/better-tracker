import React, { useState } from 'react';
import { appendEvent, newEvent, VaultEvent } from './vault';

interface Routine { id: string; name: string; }
interface Plan { id: string; routineId: string; days: number[]; startTime: string; duration: number; }

interface Props { deviceId: string; events: VaultEvent[]; routines: Routine[]; onRefresh: () => void; }

export default function PlanView({ deviceId, events, routines, onRefresh }: Props) {
  const plans: Plan[] = events.filter(e => e.kind === 'plan.saved').map(e => e.payload as Plan);
  const [routineId, setRoutineId] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('18:00');
  const [duration, setDuration] = useState(60);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  const toggleDay = (d: number) => setDays(days.includes(d) ? days.filter(x=>x!==d) : [...days, d].sort());
  const save = async () => {
    if (!routineId || days.length === 0) return;
    const p: Plan = { id: crypto.randomUUID(), routineId, days, startTime, duration };
    await appendEvent(newEvent(deviceId, 'plan.saved', p));
    setDays([]); setRoutineId('');
    await onRefresh();
  };
  const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  return (
    <div>
      <h1>Planificación</h1>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <select value={routineId} onChange={e=>setRoutineId(e.target.value)} style={{ padding:'0.4rem' }}>
          <option value="">-- rutina --</option>
          {routines.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {dayNames.map((d,i) => (
          <label key={i} style={{ display:'flex', alignItems:'center', gap:2 }}>
            <input type="checkbox" checked={days.includes(i)} onChange={()=>toggleDay(i)} />{d}
          </label>
        ))}
        <input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} />
        <input type="number" value={duration} onChange={e=>setDuration(Number(e.target.value))} placeholder="min" style={{ width:60 }} />
        <button onClick={save} style={{ padding:'0.4rem 0.8rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Guardar plan</button>
      </div>
      <h2>Calendario semanal</h2>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
        {dayNames.map((d,i) => {
          const ps = plans.filter(p => p.days.includes(i));
          return (
            <div key={i} style={{ background:'#f1f5f9', color:'#0f172a', padding:'0.6rem', borderRadius:6, minHeight:80 }}>
              <strong>{d}</strong>
              {ps.map(p => {
                const r = routines.find(x => x.id === p.routineId);
                const key = `${p.id}-${i}`;
                return (
                  <div key={p.id} style={{ fontSize:12, marginTop:4 }}>
                    {p.startTime} {r?.name} ({p.duration}min)
                    <button onClick={()=>setCompleted({...completed,[key]:!completed[key]})} style={{ marginLeft:4, fontSize:10 }}>
                      {completed[key] ? '✓' : '○'}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}