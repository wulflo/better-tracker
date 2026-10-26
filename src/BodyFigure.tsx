import React, { useState, useRef } from 'react';

export interface BodyMeasures {
  sex: 'male' | 'female';
  age: number;
  weight: number;
  height: number;
  neck: number; chest: number; waist: number; hip: number;
  arm: number; thigh: number; calf: number; wrist: number;
}

const LIMITS: Record<string, { male: [number, number]; female: [number, number] }> = {
  neck: { male: [28, 50], female: [25, 45] },
  chest: { male: [70, 140], female: [70, 130] },
  waist: { male: [50, 140], female: [50, 130] },
  hip: { male: [70, 140], female: [70, 140] },
  arm: { male: [20, 50], female: [18, 45] },
  thigh: { male: [35, 75], female: [35, 75] },
  calf: { male: [25, 50], female: [25, 45] },
  wrist: { male: [14, 22], female: [12, 20] },
  height: { male: [150, 210], female: [140, 200] },
};

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function bodyFatNavy(m: BodyMeasures): number | null {
  const { neck, waist, hip, height, sex } = m;
  if (sex === 'male') {
    if (waist <= neck) return null;
    return 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
  } else {
    if (waist + hip <= neck) return null;
    return 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(height)) - 450;
  }
}
function bodyFatDeurenberg(bmi: number, age: number, sex: 'male'|'female'): number {
  const s = sex === 'male' ? 1 : 0;
  return 1.2 * bmi + 0.23 * age - 10.8 * s - 5.4;
}
function bodyFatCunBae(bmi: number, age: number, sex: 'male'|'female'): number {
  const s = sex === 'male' ? 0 : 1;
  return -44.988 + 0.503 * age + 10.689 * s + 3.172 * bmi - 0.026 * bmi * bmi + 0.181 * bmi * s - 0.02 * bmi * age - 0.005 * bmi * bmi * s + 0.00021 * bmi * bmi * age;
}

export default function BodyFigure({ measures, onChange }: { measures: BodyMeasures; onChange: (m: BodyMeasures) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const update = (key: keyof BodyMeasures, val: number) => {
    const lim = (LIMITS as any)[key];
    const [min, max] = lim ? (sex === 'male' ? lim.male : lim.female) : [0, 999];
    onChange({ ...measures, [key]: clamp(val, min, max) });
  };

  const handlePointerDown = (key: string) => (e: React.PointerEvent) => {
    setDragging(key);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (key: string, axis: 'x' | 'y', scale: (v: number) => number, inverse: (v: number) => number) => (e: React.PointerEvent) => {
    if (dragging !== key) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pos = axis === 'x' ? (e.clientX - rect.left) / rect.width * 200 : (e.clientY - rect.top) / rect.height * 300;
    const val = inverse(pos);
    update(key as keyof BodyMeasures, val);
  };
  const handlePointerUp = () => setDragging(null);

  const sex = measures.sex;
  const lim = (k: string) => sex === 'male' ? (LIMITS as any)[k].male : (LIMITS as any)[k].female;

  // Scale factors for silhouette (normalized 0-1)
  const waistScale = (measures.waist - lim('waist')[0]) / (lim('waist')[1] - lim('waist')[0]);
  const hipScale = (measures.hip - lim('hip')[0]) / (lim('hip')[1] - lim('hip')[0]);
  const chestScale = (measures.chest - lim('chest')[0]) / (lim('chest')[1] - lim('chest')[0]);

  const bmi = measures.weight > 0 && measures.height > 0 ? measures.weight / ((measures.height / 100) ** 2) : 0;
  const navy = bodyFatNavy(measures);
  const deurenberg = bmi > 0 ? bodyFatDeurenberg(bmi, measures.age, sex) : null;
  const cunbae = bmi > 0 ? bodyFatCunBae(bmi, measures.age, sex) : null;
  const methods = [navy, deurenberg, cunbae].filter((v): v is number => v !== null && isFinite(v));
  const fatMin = methods.length ? Math.min(...methods) : null;
  const fatMax = methods.length ? Math.max(...methods) : null;
  const fatAvg = methods.length ? methods.reduce((a, b) => a + b, 0) / methods.length : null;
  const fatMass = fatAvg !== null ? (measures.weight * fatAvg / 100) : null;
  const leanMass = fatMass !== null ? measures.weight - fatMass : null;
  const bmrMifflin = sex === 'male'
    ? 10 * measures.weight + 6.25 * measures.height - 5 * measures.age + 5
    : 10 * measures.weight + 6.25 * measures.height - 5 * measures.age - 161;
  const bmrKatch = leanMass !== null ? 370 + 21.6 * leanMass : null;
  const bmrCunningham = leanMass !== null ? 500 + 22 * leanMass : null;
  const tdee = bmrMifflin * 1.55;

  const whr = measures.waist / measures.hip;
  const whtr = measures.waist / measures.height;

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <div>
        <div style={{ marginBottom: 8 }}>
          <label>Sexo: </label>
          <select value={sex} onChange={e => onChange({ ...measures, sex: e.target.value as any })}>
            <option value="male">Hombre</option>
            <option value="female">Mujer</option>
          </select>
          <label style={{ marginLeft: 12 }}>Edad: </label>
          <input type="number" value={measures.age} onChange={e => update('age', Number(e.target.value))} style={{ width: 60 }} min={10} max={100} />
          <label style={{ marginLeft: 12 }}>Peso (kg): </label>
          <input type="number" value={measures.weight} onChange={e => update('weight', Number(e.target.value))} style={{ width: 60 }} min={30} max={250} />
        </div>
        <svg ref={svgRef} width={200} height={300} viewBox="0 0 200 300" style={{ background: '#f1f5f9', borderRadius: 8 }}>
          {/* Silhouette */}
          <ellipse cx={100} cy={40} rx={20 + chestScale * 6} ry={24} fill="#cbd5e1" />
          <rect x={80 - waistScale * 8} y={64} width={40 + waistScale * 16} height={60} rx={8} fill="#cbd5e1" />
          <ellipse cx={100} cy={140} rx={22 + hipScale * 10} ry={16} fill="#cbd5e1" />
          <rect x={75} y={156} width={20} height={80} rx={6} fill="#cbd5e1" />
          <rect x={105} y={156} width={20} height={80} rx={6} fill="#cbd5e1" />
          {/* Nodes */}
          {[
            { key: 'neck', x: 100, y: 60, axis: 'x' as const },
            { key: 'chest', x: 100, y: 75, axis: 'x' as const },
            { key: 'waist', x: 100, y: 95, axis: 'x' as const },
            { key: 'hip', x: 100, y: 140, axis: 'x' as const },
            { key: 'arm', x: 60, y: 85, axis: 'y' as const },
            { key: 'thigh', x: 80, y: 180, axis: 'y' as const },
            { key: 'calf', x: 85, y: 220, axis: 'y' as const },
          ].map(n => (
            <circle
              key={n.key}
              cx={n.x} cy={n.y} r={6}
              fill={dragging === n.key ? '#ef4444' : '#38bdf8'}
              stroke="#0f172a" strokeWidth={1}
              style={{ cursor: 'grab' }}
              onPointerDown={handlePointerDown(n.key)}
              onPointerMove={handlePointerMove(n.key, n.axis, (v: number) => v, (v: number) => {
                const [min, max] = lim(n.key);
                return min + (v / 200) * (max - min);
              })}
              onPointerUp={handlePointerUp}
            />
          ))}
        </svg>
        <p style={{ fontSize: 11, opacity: .6, marginTop: 4 }}>Arrastra los nodos. Ajusta peso/edad arriba.</p>
      </div>
      <div style={{ flex: 1, minWidth: 300 }}>
        <h2>Resultados</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td>IMC</td><td>{bmi.toFixed(1)}</td></tr>
            <tr><td>% grasa (Navy)</td><td>{navy !== null ? navy.toFixed(1) + '%' : 'N/A'}</td></tr>
            <tr><td>% grasa (Deurenberg)</td><td>{deurenberg !== null ? deurenberg.toFixed(1) + '%' : 'N/A'}</td></tr>
            <tr><td>% grasa (CUN-BAE)</td><td>{cunbae !== null ? cunbae.toFixed(1) + '%' : 'N/A'}</td></tr>
            <tr><td>Intervalo global</td><td>{fatMin !== null && fatMax !== null ? `${fatMin.toFixed(1)}–${fatMax.toFixed(1)}%` : 'N/A'}</td></tr>
            <tr><td>Masa grasa</td><td>{fatMass !== null ? fatMass.toFixed(1) + ' kg' : 'N/A'}</td></tr>
            <tr><td>Masa magra</td><td>{leanMass !== null ? leanMass.toFixed(1) + ' kg' : 'N/A'}</td></tr>
            <tr><td>Cintura/altura</td><td>{whtr.toFixed(2)}</td></tr>
            <tr><td>Cintura/cadera</td><td>{whr.toFixed(2)}</td></tr>
            <tr><td>BMR (Mifflin-St Jeor)</td><td>{bmrMifflin.toFixed(0)} kcal</td></tr>
            {bmrKatch !== null && <tr><td>BMR (Katch-McArdle)</td><td>{bmrKatch.toFixed(0)} kcal</td></tr>}
            {bmrCunningham !== null && <tr><td>BMR (Cunningham)</td><td>{bmrCunningham.toFixed(0)} kcal</td></tr>}
            <tr><td>TDEE (factor 1.55)</td><td>{tdee.toFixed(0)} kcal</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: 11, opacity: .6, marginTop: 8 }}>
          Las fórmulas son estimaciones. Fuentes: Navy (Hodgdon & Beckett 1984), Deurenberg (1991), CUN-BAE (Gómez-Ambrosi 2012), Mifflin-St Jeor (1990), Katch-McArdle, Cunningham (1980), Tanaka (2001).
        </p>
      </div>
    </div>
  );
}