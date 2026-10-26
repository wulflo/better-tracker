import React, { useState } from 'react';
import { VaultEvent } from './vault';

interface Props { events: VaultEvent[]; }

export default function CalendarView({ events }: Props) {
  const [month, setMonth] = useState(new Date());
  const sessions = events.filter(e => e.kind === 'session.saved' || e.kind === 'workout.saved');
  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const hasSession = (d: number) => {
    const dateStr = `${year}-${String(mon+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return sessions.some(s => s.payload.date === dateStr);
  };
  return (
    <div>
      <h1>Calendario</h1>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button onClick={()=>setMonth(new Date(year,mon-1,1))}>◀</button>
        <strong>{month.toLocaleString('es',{month:'long',year:'numeric'})}</strong>
        <button onClick={()=>setMonth(new Date(year,mon+1,1))}>▶</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
        {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => <div key={d} style={{ textAlign:'center', fontWeight:'bold' }}>{d}</div>)}
        {cells.map((d,i) => (
          <div key={i} style={{ background: d && hasSession(d) ? '#22c55e' : '#f1f5f9', color: d && hasSession(d) ? 'white' : '#0f172a', padding:'0.6rem', borderRadius:4, minHeight:40, textAlign:'center' }}>
            {d || ''}
          </div>
        ))}
      </div>
    </div>
  );
}