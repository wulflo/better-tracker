import React, { useState } from 'react';
import { appendEvent, newEvent, VaultEvent } from './vault';

interface Props { deviceId: string; events: VaultEvent[]; onRefresh: () => void; }

interface Nut { date: string; kcal: number; protein: number; carbs: number; fat: number; water: number; }

export default function NutritionView({ deviceId, events, onRefresh }: Props) {
  const logs: Nut[] = events.filter(e => e.kind === 'nutrition.logged').map(e => e.payload as Nut);
  const [form, setForm] = useState<Nut>({ date: new Date().toISOString().slice(0,10), kcal: 0, protein: 0, carbs: 0, fat: 0, water: 0 });
  const save = async () => {
    await appendEvent(newEvent(deviceId, 'nutrition.logged', form));
    await onRefresh();
  };
  const today = logs.find(l => l.date === form.date);
  return (
    <div>
      <h1>Nutrición</h1>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, maxWidth:400, marginBottom:16 }}>
        {(['kcal','protein','carbs','fat','water'] as const).map(k => (
          <label key={k} style={{ display:'flex', flexDirection:'column' }}>
            <span>{k}</span>
            <input type="number" value={(form as any)[k]} onChange={e => setForm({ ...form, [k]: Number(e.target.value) })} />
          </label>
        ))}
        <label style={{ display:'flex', flexDirection:'column' }}>
          <span>fecha</span>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        </label>
      </div>
      <button onClick={save} style={{ padding:'0.6rem 1.2rem', background:'#38bdf8', border:'none', borderRadius:6, cursor:'pointer' }}>Guardar</button>
      {today && <p style={{ marginTop:8 }}>Hoy: {today.kcal} kcal, {today.protein}g prot, {today.carbs}g CHO, {today.fat}g grasa, {today.water}ml agua</p>}
      <h2 style={{ marginTop:16 }}>Historial</h2>
      {logs.slice().reverse().map((l,i) => (
        <div key={i} style={{ padding:'0.4rem', background:'#f1f5f9', color:'#0f172a', borderRadius:4, marginBottom:4 }}>
          {l.date}: {l.kcal} kcal | P{l.protein} C{l.carbs} G{l.fat} | {l.water}ml
        </div>
      ))}
    </div>
  );
}