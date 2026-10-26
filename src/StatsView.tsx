import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { VaultEvent } from './vault';

interface Props { events: VaultEvent[]; }

export default function StatsView({ events }: Props) {
  const sessions = events.filter(e => e.kind === 'session.saved');
  const workouts = events.filter(e => e.kind === 'workout.saved');
  const weights = events.filter(e => e.kind === 'weight.logged');
  const prs = events.filter(e => e.kind === 'pr.achieved');
  const totalVolume = workouts.reduce((acc, w) => acc + w.payload.entries.reduce((a: number, e: any) => a + e.sets.reduce((s: number, x: any) => s + x.reps * x.weight, 0), 0), 0);
  const totalTime = sessions.reduce((a, s) => a + (s.payload.duration || 0), 0);

  // 1RM estimates from PRs
  const exportCsv = async () => {
    const rows = ['fecha,ejercicio,series,reps,peso'];
    for (const w of workouts) {
      for (const e of w.payload.entries) {
        for (const s of e.sets) {
          rows.push(`${w.payload.date},${e.exerciseId},${e.sets.length},${s.reps},${s.weight}`);
        }
      }
    }
    try { await invoke('save_text_file', { content: rows.join('\n'), filterName: 'CSV', ext: 'csv' }); } catch (e) { console.error(e); }
  };

  const oneRMs = prs.map(p => {
    const w = p.payload.weight;
    // assume ~5 reps for estimate; use stored reps if available
    const reps = p.payload.reps || 5;
    const epley = reps <= 10 ? w * (1 + reps / 30) : null;
    const brzycki = reps <= 10 ? w * 36 / (37 - reps) : null;
    return { name: p.payload.name, weight: w, reps, epley, brzycki };
  });

  return (
    <div>
      <h1>Estadísticas</h1>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, maxWidth:500 }}>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>Sesiones</strong><p>{sessions.length}</p></div>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>Entrenamientos guardados</strong><p>{workouts.length}</p></div>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>Volumen total (kg)</strong><p>{totalVolume.toFixed(0)}</p></div>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>Tiempo total (min)</strong><p>{Math.floor(totalTime / 60)}</p></div>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>Registros de peso</strong><p>{weights.length}</p></div>
        <div style={{ background:'#f1f5f9', color:'#0f172a', padding:'1rem', borderRadius:6 }}><strong>PRs</strong><p>{prs.length}</p></div>
      </div>
      <p style={{ fontSize:11, opacity:.6, marginTop:8 }}>Sin exportación. Sincroniza la carpeta de la bóveda con tu herramienta preferida.</p>
      {oneRMs.length > 0 && (
        <>
          <h2 style={{ marginTop:16 }}>Estimación de 1RM (Epley/Brzycki)</h2>
          <p style={{ fontSize:11, opacity:.6 }}>Pierde fiabilidad con muchas repeticiones. Solo orientativo.</p>
          {oneRMs.map((r,i) => (
            <div key={i} style={{ padding:'0.4rem', background:'#f1f5f9', color:'#0f172a', borderRadius:4, marginBottom:4 }}>
              {r.name}: {r.weight}kg x {r.reps} → Epley {r.epley?.toFixed(1)} / Brzycki {r.brzycki?.toFixed(1)}
            </div>
          ))}
        </>
      )}
    </div>
  );
}