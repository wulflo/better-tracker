import React, { useRef, useState } from 'react';
import type { BodyMeasures } from './types';
import { clamp } from './metrics';

interface Limits {
  min: number;
  max: number;
}

const NEUTRAL: Record<string, Limits> = {
  neck: { min: 28, max: 48 },
  chest: { min: 78, max: 122 },
  waist: { min: 58, max: 112 },
  hip: { min: 82, max: 118 },
  arm: { min: 22, max: 42 },
  thigh: { min: 42, max: 68 },
  calf: { min: 28, max: 44 },
  wrist: { min: 14, max: 21 },
};

const LIMITS: Record<string, { male: Limits; female: Limits }> = {
  neck: { male: { min: 28, max: 50 }, female: { min: 25, max: 45 } },
  chest: { male: { min: 78, max: 135 }, female: { min: 72, max: 125 } },
  waist: { male: { min: 55, max: 135 }, female: { min: 50, max: 125 } },
  hip: { male: { min: 78, max: 135 }, female: { min: 78, max: 140 } },
  arm: { male: { min: 22, max: 50 }, female: { min: 18, max: 44 } },
  thigh: { male: { min: 38, max: 78 }, female: { min: 38, max: 78 } },
  calf: { male: { min: 26, max: 52 }, female: { min: 24, max: 48 } },
  wrist: { male: { min: 14, max: 23 }, female: { min: 12, max: 21 } },
};

function limitsFor(key: string, sex: BodyMeasures['sex']): Limits {
  if (sex === 'unspecified') return NEUTRAL[key] ?? { min: 0, max: 1 };
  return LIMITS[key]?.[sex] ?? NEUTRAL[key] ?? { min: 0, max: 1 };
}

const NODES: Array<{ key: keyof BodyMeasures; label: string; x: number; y: number }> = [
  { key: 'neck', label: 'Cuello', x: 150, y: 90 },
  { key: 'chest', label: 'Pecho', x: 150, y: 132 },
  { key: 'waist', label: 'Cintura', x: 150, y: 190 },
  { key: 'hip', label: 'Cadera', x: 150, y: 240 },
  { key: 'arm', label: 'Brazo', x: 72, y: 160 },
  { key: 'thigh', label: 'Muslo', x: 126, y: 320 },
  { key: 'calf', label: 'Pantorrilla', x: 128, y: 382 },
  { key: 'wrist', label: 'Muñeca', x: 54, y: 246 },
];

export default function BodyFigure({
  measures,
  onChange,
}: {
  measures: BodyMeasures;
  onChange: (m: BodyMeasures) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const valueOf = (key: keyof BodyMeasures): number => {
    const v = Number(measures[key]);
    if (Number.isFinite(v) && v > 0) return v;
    const lim = limitsFor(key, measures.sex);
    return (lim.min + lim.max) / 2;
  };

  const scaleOf = (key: keyof BodyMeasures): number => {
    const lim = limitsFor(key, measures.sex);
    return clamp((valueOf(key) - lim.min) / Math.max(1, lim.max - lim.min), 0, 1);
  };

  const setValue = (key: keyof BodyMeasures, value: number) => {
    const lim = limitsFor(key, measures.sex);
    onChange({ ...measures, [key]: Math.round(clamp(value, lim.min, lim.max) * 10) / 10 });
  };

  const onPointerDown = (key: string) => (e: React.PointerEvent<SVGCircleElement>) => {
    e.preventDefault();
    setDragging(key);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (key: keyof BodyMeasures) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (dragging !== key) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 300;
    const y = ((e.clientY - rect.top) / rect.height) * 420;
    const distance = Math.hypot(x - 150, y - 120);
    const lim = limitsFor(key, measures.sex);
    // Dragging outward from the body center increases the circumference.
    const normalized = clamp((distance - 42) / 118, 0, 1);
    setValue(key, lim.min + normalized * (lim.max - lim.min));
  };

  const onPointerUp = (e: React.PointerEvent<SVGCircleElement>) => {
    setDragging(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was already released.
    }
  };

  const chest = 38 + scaleOf('chest') * 26;
  const waist = 29 + scaleOf('waist') * 20;
  const hip = 35 + scaleOf('hip') * 25;
  const arm = 10 + scaleOf('arm') * 9;
  const thigh = 18 + scaleOf('thigh') * 13;
  const calf = 9 + scaleOf('calf') * 9;
  const neck = 11 + scaleOf('neck') * 5;

  return (
    <div className="body-figure">
      <svg ref={svgRef} viewBox="0 0 300 420" role="img" aria-label="Figura corporal adaptativa">
        <defs>
          <linearGradient id="figure-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b69cff" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#8f6fe8" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#5b3ea8" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="figure-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#eadcff" />
            <stop offset="100%" stopColor="#a98bff" />
          </linearGradient>
          <filter id="figure-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <ellipse cx="150" cy="214" rx="82" ry="172" fill="url(#figure-fill)" opacity="0.08" />

        {/* Cabeza y cuello */}
        <circle cx="150" cy="54" r="31" fill="url(#figure-fill)" stroke="url(#figure-stroke)" strokeWidth="2" />
        <path
          d={`M${150 - neck} 82 L${150 + neck} 82 L${150 + neck + 5} 100 L${150 - neck - 5} 100 Z`}
          fill="url(#figure-fill)"
          stroke="url(#figure-stroke)"
          strokeWidth="1.5"
        />

        {/* Torso */}
        <path
          d={`M${150 - chest} 112
              C${150 - chest - 9} 150, ${150 - waist} 168, ${150 - waist} 198
              C${150 - waist} 224, ${150 - hip} 238, ${150 - hip} 252
              L${150 + hip} 252
              C${150 + hip} 238, ${150 + waist} 224, ${150 + waist} 198
              C${150 + waist} 168, ${150 + chest + 9} 150, ${150 + chest} 112
              C${150 + 18} 100, ${150 - 18} 100, ${150 - chest} 112 Z`}
          fill="url(#figure-fill)"
          stroke="url(#figure-stroke)"
          strokeWidth="2"
        />

        {/* Hombros */}
        <ellipse cx={150 - chest + 4} cy="118" rx={arm + 9} ry="14" fill="url(#figure-fill)" opacity="0.92" stroke="url(#figure-stroke)" strokeWidth="1.2" />
        <ellipse cx={150 + chest - 4} cy="118" rx={arm + 9} ry="14" fill="url(#figure-fill)" opacity="0.92" stroke="url(#figure-stroke)" strokeWidth="1.2" />

        {/* Brazos */}
        <path
          d={`M${150 - chest - 2} 124 Q${150 - chest - arm - 13} 170 ${150 - chest - arm - 7} 246`}
          fill="none"
          stroke="url(#figure-fill)"
          strokeWidth={arm * 2}
          strokeLinecap="round"
        />
        <path
          d={`M${150 + chest + 2} 124 Q${150 + chest + arm + 13} 170 ${150 + chest + arm + 7} 246`}
          fill="none"
          stroke="url(#figure-fill)"
          strokeWidth={arm * 2}
          strokeLinecap="round"
        />

        {/* Piernas */}
        <path
          d={`M${150 - hip + 8} 250 Q${150 - hip + 4} 300 ${150 - 26} 348`}
          fill="none"
          stroke="url(#figure-fill)"
          strokeWidth={thigh * 2}
          strokeLinecap="round"
        />
        <path
          d={`M${150 + hip - 8} 250 Q${150 + hip - 4} 300 ${150 + 26} 348`}
          fill="none"
          stroke="url(#figure-fill)"
          strokeWidth={thigh * 2}
          strokeLinecap="round"
        />
        <path
          d={`M${150 - 26} 352 Q${150 - 24} 386 ${150 - 22} 404`}
          fill="none"
          stroke="url(#figure-fill)"
          strokeWidth={calf * 2}
          strokeLinecap="round"
        />
        <path
          d={`M${150 + 26} 352 Q${150 + 24} 386 ${150 + 22} 404`}
          fill="none"
          stroke="url(#figure-fill)"
          strokeWidth={calf * 2}
          strokeLinecap="round"
        />

        {/* Nodos arrastrables */}
        {NODES.map((node) => {
          const active = dragging === node.key;
          const value = valueOf(node.key);
          const toRight = node.x >= 150;
          const dx = toRight ? 14 : -14;
          const anchor = toRight ? 'start' : 'end';
          return (
            <g key={node.key}>
              <circle
                cx={node.x}
                cy={node.y}
                r={active ? 9 : 7}
                fill={active ? '#ffd27d' : '#d0bcff'}
                stroke="#24124a"
                strokeWidth="2"
                style={{ cursor: 'grab', filter: active ? 'url(#figure-glow)' : undefined }}
                onPointerDown={onPointerDown(node.key)}
                onPointerMove={onPointerMove(node.key)}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <title>{`${node.label}: ${value.toFixed(1)} cm`}</title>
              </circle>
              <text x={node.x + dx} y={node.y + 4} textAnchor={anchor} className="figure-node-label">
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="figure-caption">
        <span>Arrastra los nodos hacia fuera para aumentar la medida.</span>
        {measures.sex === 'unspecified' && <span className="badge badge-muted">Sexo sin especificar: límites neutros</span>}
      </div>
    </div>
  );
}
