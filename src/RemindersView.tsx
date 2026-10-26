import React, { useState, useEffect } from 'react';
import { appendEvent, newEvent, VaultEvent } from './vault';

interface Reminder { id: string; title: string; time: string; days: number[]; enabled: boolean; }
interface Props { deviceId: string; events: VaultEvent[]; onRefresh: () => void; }

export default function RemindersView({ deviceId, events, onRefresh }: Props) {
  const reminders: Reminder[] = events.filter(e => e.kind === 'reminder.saved').map(e => e.payload as Reminder);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('18:00');
  const [days, setDays] = useState<number[]>([1,3,5]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }, []);

  const toggleDay = (d: number) => setDays(days.includes(d) ? days.filter(x=>x!==d) : [...days,d].sort());
  const save = async () => {
    if (!title.trim()) return;
    const r: Reminder = { id: crypto.randomUUID(), title: title.trim(), time, days, enabled: true };
    await appendEvent(newEvent(deviceId, 'reminder.saved', r));
    setTitle('');
    await onRefresh();
  };

  // Fire reminders while app is open
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      for (const r of reminders) {
        if (r.enabled && r.time === hhmm && r.days.includes(now.getDay())) {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Better Tracker', { body: r.title });
          }
        }
      }
    };
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [reminders]);

  const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  return (
    <div>
      <h1>Recordatorios</h1>
      <p style={{ fontSize:12, opacity:.6 }}>Solo se disparan mientras la app está en ejecución.</p>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Título" />
        <input type="time" value={time} onChange={e=>setTime(e.target.value)} />
        {dayNames.map((d,i) => (
          <label key={i}><input type="checkbox" checked={days.includes(i)} onChange={()=>toggleDay(i)} />{d}</label>
        ))}
        <button onClick={save} style={{ padding:'0.4rem 0.8rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Guardar</button>
      </div>
      {reminders.length === 0 && <p style={{ opacity:.6 }}>Sin recordatorios.</p>}
      {reminders.map(r => (
        <div key={r.id} style={{ background:'#f1f5f9', color:'#0f172a', padding:'0.8rem', borderRadius:6, marginBottom:8 }}>
          <strong>{r.title}</strong> — {r.time} — {r.days.map(d=>dayNames[d]).join(', ')}
        </div>
      ))}
    </div>
  );
}