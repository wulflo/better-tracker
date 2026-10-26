import React from 'react';
import { VaultEvent } from './vault';

interface Props { events: VaultEvent[]; }

export default function StatsView({ events }: Props) {
  const sessions = events.filter(e => e.kind === 'session.saved');
  const workouts = events.filter(e => e.kind === 'workout.saved');
  const weights = events.filter(e => e.kind === 'weight.logged');
  const totalVolume = workouts.reduce((acc, w) => acc + w.payload.entries.reduce((a: number, e: any) => a + e.sets.reduce((s: number, x: any) => s + x.reps * x.weight, 0), 0), 0);
  const totalTime = sessions.reduce((a, s) => a + (s.payload.duration || 0), 0);
  return (
    <div>
      <h1>Estadísticas</h1>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, maxWidth:500 }}>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>Sesiones</strong><p>{sessions.length}</p></div>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>Entrenamientos guardados</strong><p>{workouts.length}</p></div>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>Volumen total (kg)</strong><p>{totalVolume.toFixed(0)}</p></div>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>Tiempo total (min)</strong><p>{Math.floor(totalTime / 60)}</p></div>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>Registros de peso</strong><p>{weights.length}</p></div>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>Eventos totales</strong><p>{events.length}</p></div>
      </div>
    </div>
  );
}