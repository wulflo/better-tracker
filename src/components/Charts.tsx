import React, { useMemo, useState } from 'react';
import type { Exercise, PR, VaultEvent } from '../types';
import { BODY_ZONES, ZONE_MAP, type ZoneId } from '../zones';
import {
  addDays,
  formatShort,
  monthLabel,
  parseISO,
  reduceSessions,
  reduceWorkouts,
  todayISO,
  weekKey,
  type ZoneLoad,
} from '../metrics';

export function EmptyChart({ text = 'Aún no hay datos suficientes.' }: { text?: string }) {
  return <div className="chart-empty">{text}</div>;
}

interface LinePoint {
  label: string;
  value: number;
  mark?: boolean;
}

export function LineChart({
  points,
  color = 'var(--primary)',
  height = 170,
  suffix = '',
  area = true,
  zeroBased = true,
  decimals = 0,
}: {
  points: LinePoint[];
  color?: string;
  height?: number;
  suffix?: string;
  area?: boolean;
  zeroBased?: boolean;
  decimals?: number;
}) {
  if (points.length === 0) return <EmptyChart />;
  const w = 640;
  const h = height;
  const pad = { l: 42, r: 12, t: 16, b: 28 };
  const values = points.map((p) => p.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const padValue = Math.max(0.5, (dataMax - dataMin) * 0.18);
  const max = zeroBased ? Math.max(dataMax, 1) : dataMax + padValue;
  const min = zeroBased ? Math.min(dataMin, 0) : dataMin - padValue;
  const span = max - min || 1;
  const formatValue = (value: number) => value.toFixed(decimals);
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (h - pad.t - pad.b);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${line} L${x(points.length - 1).toFixed(1)},${h - pad.b} L${x(0).toFixed(1)},${h - pad.b} Z`;
  const ticks = [0, 0.5, 1].map((t) => min + span * t);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--outline-variant)" strokeDasharray="3 5" />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">
            {formatValue(t)}
          </text>
        </g>
      ))}
      {area && <path d={areaPath} fill={color} opacity="0.12" />}
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          <circle cx={x(i)} cy={y(p.value)} r={p.mark ? 5 : 3} fill={p.mark ? 'var(--warning)' : color} stroke="var(--surface)" strokeWidth="1.5">
            <title>{`${p.label}: ${formatValue(p.value)}${suffix}${p.mark ? ' · marca personal' : ''}`}</title>
          </circle>
          {p.mark && <circle cx={x(i)} cy={y(p.value)} r={9} fill="none" stroke="var(--warning)" strokeWidth="1.5" opacity="0.7" />}
          {i % labelEvery === 0 && (
            <text x={x(i)} y={h - 8} textAnchor="middle" className="chart-axis">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

interface BarItem {
  label: string;
  value: number;
  color?: string;
  hint?: string;
}

export function BarChart({ items, height = 170, suffix = '' }: { items: BarItem[]; height?: number; suffix?: string }) {
  if (items.length === 0) return <EmptyChart />;
  const w = 640;
  const h = height;
  const pad = { l: 42, r: 12, t: 16, b: 32 };
  const max = Math.max(...items.map((i) => i.value), 1);
  const bw = (w - pad.l - pad.r) / items.length;
  const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  const ticks = [0, 0.5, 1].map((t) => max * t);

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--outline-variant)" strokeDasharray="3 5" />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">
            {Math.round(t)}
          </text>
        </g>
      ))}
      {items.map((item, i) => {
        const bx = pad.l + i * bw + bw * 0.18;
        const barW = bw * 0.64;
        const by = y(item.value);
        return (
          <g key={item.label + i}>
            <rect x={bx} y={by} width={barW} height={Math.max(0, h - pad.b - by)} rx={5} fill={item.color || 'var(--primary)'} opacity="0.9">
              <title>{`${item.label}: ${item.value}${suffix}${item.hint ? ` · ${item.hint}` : ''}`}</title>
            </rect>
            <text x={bx + barW / 2} y={h - 12} textAnchor="middle" className="chart-axis">
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ProgressBar({
  value,
  max = 100,
  color = 'var(--primary)',
  label,
  valueLabel,
}: {
  value: number;
  max?: number;
  color?: string;
  label?: string;
  valueLabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="progress-wrap">
      {(label || valueLabel) && (
        <div className="progress-labels">
          <span>{label}</span>
          <span>{valueLabel ?? `${Math.round(pct)}%`}</span>
        </div>
      )}
      <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function intensityFor(load: ZoneLoad | undefined): number {
  if (!load) return 0;
  const zone = ZONE_MAP[load.zoneId];
  if (!zone) return 0;
  const maxSets = zone.weeklySets[1] || 1;
  const maxMinutes = zone.weeklyMinutes[1] || 1;
  return Math.max(load.sets / maxSets, load.minutes / maxMinutes);
}

export function BodyHeatmap({
  load,
  compact = false,
}: {
  load: Record<ZoneId, ZoneLoad>;
  compact?: boolean;
}) {
  const [hover, setHover] = useState<ZoneId | null>(null);
  const intensity = (z: ZoneId) => Math.max(0, Math.min(1, intensityFor(load[z])));
  const fill = (z: ZoneId) => {
    const base = ZONE_MAP[z].color;
    return { fill: base, fillOpacity: 0.14 + intensity(z) * 0.86 };
  };
  const top = [...BODY_ZONES].sort((a, b) => intensity(b.id) - intensity(a.id))[0];
  const active = hover || (top && intensity(top.id) > 0 ? top.id : null);

  return (
    <div className={`body-heatmap ${compact ? 'compact' : ''}`}>
      <svg viewBox="0 0 270 270" role="img" aria-label="Mapa de calor muscular">
        <defs>
          <linearGradient id="bodyBase" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a3448" />
            <stop offset="100%" stopColor="#292533" />
          </linearGradient>
        </defs>

        {/* Frente */}
        <g transform="translate(10,8)">
          <circle cx="60" cy="26" r="14" fill="url(#bodyBase)" stroke="#514a61" />
          <rect x="54" y="40" width="12" height="9" rx="3" fill="url(#bodyBase)" />
          <path d="M38 53 Q60 46 82 53 L87 92 Q60 100 33 92 Z" {...fill('chest')} stroke="#514a61" strokeWidth="1"
            onMouseEnter={() => setHover('chest')} onMouseLeave={() => setHover(null)}>
            <title>Pecho</title>
          </path>
          <ellipse cx="36" cy="59" rx="12" ry="9" {...fill('shoulders')} stroke="#514a61"
            onMouseEnter={() => setHover('shoulders')} onMouseLeave={() => setHover(null)}><title>Hombros</title></ellipse>
          <ellipse cx="84" cy="59" rx="12" ry="9" {...fill('shoulders')} stroke="#514a61"
            onMouseEnter={() => setHover('shoulders')} onMouseLeave={() => setHover(null)}><title>Hombros</title></ellipse>
          <rect x="20" y="64" width="12" height="70" rx="6" {...fill('arms')} stroke="#514a61"
            onMouseEnter={() => setHover('arms')} onMouseLeave={() => setHover(null)}><title>Brazos</title></rect>
          <rect x="88" y="64" width="12" height="70" rx="6" {...fill('arms')} stroke="#514a61"
            onMouseEnter={() => setHover('arms')} onMouseLeave={() => setHover(null)}><title>Brazos</title></rect>
          <rect x="42" y="92" width="36" height="50" rx="9" {...fill('core')} stroke="#514a61"
            onMouseEnter={() => setHover('core')} onMouseLeave={() => setHover(null)}><title>Core</title></rect>
          <rect x="44" y="142" width="14" height="72" rx="7" {...fill('legs')} stroke="#514a61"
            onMouseEnter={() => setHover('legs')} onMouseLeave={() => setHover(null)}><title>Piernas</title></rect>
          <rect x="62" y="142" width="14" height="72" rx="7" {...fill('legs')} stroke="#514a61"
            onMouseEnter={() => setHover('legs')} onMouseLeave={() => setHover(null)}><title>Piernas</title></rect>
          <rect x="44" y="214" width="14" height="36" rx="6" {...fill('calves')} stroke="#514a61"
            onMouseEnter={() => setHover('calves')} onMouseLeave={() => setHover(null)}><title>Pantorrillas</title></rect>
          <rect x="62" y="214" width="14" height="36" rx="6" {...fill('calves')} stroke="#514a61"
            onMouseEnter={() => setHover('calves')} onMouseLeave={() => setHover(null)}><title>Pantorrillas</title></rect>
          <text x="60" y="266" textAnchor="middle" className="heatmap-caption">Frente</text>
        </g>

        {/* Espalda */}
        <g transform="translate(145,8)">
          <circle cx="60" cy="26" r="14" fill="url(#bodyBase)" stroke="#514a61" />
          <rect x="54" y="40" width="12" height="9" rx="3" fill="url(#bodyBase)" />
          <path d="M38 53 Q60 46 82 53 L87 108 Q60 120 33 108 Z" {...fill('back')} stroke="#514a61"
            onMouseEnter={() => setHover('back')} onMouseLeave={() => setHover(null)}><title>Espalda</title></path>
          <ellipse cx="36" cy="59" rx="12" ry="9" {...fill('shoulders')} stroke="#514a61"
            onMouseEnter={() => setHover('shoulders')} onMouseLeave={() => setHover(null)}><title>Hombros</title></ellipse>
          <ellipse cx="84" cy="59" rx="12" ry="9" {...fill('shoulders')} stroke="#514a61"
            onMouseEnter={() => setHover('shoulders')} onMouseLeave={() => setHover(null)}><title>Hombros</title></ellipse>
          <rect x="20" y="64" width="12" height="70" rx="6" {...fill('arms')} stroke="#514a61"
            onMouseEnter={() => setHover('arms')} onMouseLeave={() => setHover(null)}><title>Brazos</title></rect>
          <rect x="88" y="64" width="12" height="70" rx="6" {...fill('arms')} stroke="#514a61"
            onMouseEnter={() => setHover('arms')} onMouseLeave={() => setHover(null)}><title>Brazos</title></rect>
          <ellipse cx="60" cy="126" rx="22" ry="14" {...fill('legs')} stroke="#514a61"
            onMouseEnter={() => setHover('legs')} onMouseLeave={() => setHover(null)}><title>Glúteos / piernas</title></ellipse>
          <rect x="44" y="142" width="14" height="72" rx="7" {...fill('legs')} stroke="#514a61"
            onMouseEnter={() => setHover('legs')} onMouseLeave={() => setHover(null)}><title>Piernas</title></rect>
          <rect x="62" y="142" width="14" height="72" rx="7" {...fill('legs')} stroke="#514a61"
            onMouseEnter={() => setHover('legs')} onMouseLeave={() => setHover(null)}><title>Piernas</title></rect>
          <rect x="44" y="214" width="14" height="36" rx="6" {...fill('calves')} stroke="#514a61"
            onMouseEnter={() => setHover('calves')} onMouseLeave={() => setHover(null)}><title>Pantorrillas</title></rect>
          <rect x="62" y="214" width="14" height="36" rx="6" {...fill('calves')} stroke="#514a61"
            onMouseEnter={() => setHover('calves')} onMouseLeave={() => setHover(null)}><title>Pantorrillas</title></rect>
          <text x="60" y="266" textAnchor="middle" className="heatmap-caption">Espalda</text>
        </g>
      </svg>
      {!compact && (
        <div className="heatmap-side">
          <div className="heatmap-legend">
            {BODY_ZONES.map((z) => (
              <button
                key={z.id}
                type="button"
                className={`heatmap-chip ${active === z.id ? 'active' : ''}`}
                onMouseEnter={() => setHover(z.id)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="dot" style={{ background: z.color }} />
                {z.name}
              </button>
            ))}
          </div>
          {active && (
            <div className="heatmap-detail">
              <strong>{ZONE_MAP[active].name}</strong>
              <span>{Math.round(load[active]?.sets || 0)} series · {Math.round(load[active]?.minutes || 0)} min esta semana</span>
              <span className="muted">{ZONE_MAP[active].muscles.join(' · ')}</span>
            </div>
          )}
          <div className="heatmap-scale">
            <span>Menos</span>
            <div className="heatmap-gradient" />
            <span>Más</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface CalendarProps {
  events: VaultEvent[];
  exercises: Exercise[];
  prs: PR[];
}

export function CalendarHeatmap({ events, exercises, prs }: CalendarProps) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);
  const exerciseMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const sessions = useMemo(() => reduceSessions(events), [events]);
  const workouts = useMemo(() => reduceWorkouts(events), [events]);

  const year = month.getFullYear();
  const mon = month.getMonth();
  const first = new Date(year, mon, 1);
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday first
  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < lead; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ date, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });

  const dayLoad = (date: string) => {
    const ss = sessions.filter((s) => s.date === date);
    const ws = workouts.filter((w) => w.date === date);
    const minutes = ss.reduce((a, s) => a + s.duration / 60, 0) + ws.reduce((a, w) => a + w.entries.reduce((b, e) => b + e.sets.length * 3, 0), 0);
    const sets = ss.reduce((a, s) => a + s.entries.reduce((b, e) => b + e.sets.length, 0), 0)
      + ws.reduce((a, w) => a + w.entries.reduce((b, e) => b + e.sets.length, 0), 0);
    const volume = [...ss, ...ws].reduce((a, s) => a + s.entries.reduce((b, e) => b + e.sets.reduce((c, x) => c + x.reps * x.weight, 0), 0), 0);
    return { minutes, sets, volume, count: ss.length + ws.length };
  };

  const loads = cells.filter((c) => c.date).map((c) => dayLoad(c.date!));
  const maxMinutes = Math.max(1, ...loads.map((l) => l.minutes));
  const prDates = new Set(prs.map((p) => p.date));
  const sel = selected ? {
    sessions: sessions.filter((s) => s.date === selected),
    workouts: workouts.filter((w) => w.date === selected),
    prs: prs.filter((p) => p.date === selected),
  } : null;

  return (
    <div className="calendar-wrap">
      <div className="calendar-head">
        <button type="button" className="btn-icon" onClick={() => setMonth(new Date(year, mon - 1, 1))} aria-label="Mes anterior">‹</button>
        <strong className="calendar-title">{monthLabel(month)}</strong>
        <button type="button" className="btn-icon" onClick={() => setMonth(new Date(year, mon + 1, 1))} aria-label="Mes siguiente">›</button>
      </div>
      <div className="calendar-grid">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <div key={d} className="calendar-dow">{d}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell.date) return <div key={i} className="calendar-cell empty" />;
          const l = dayLoad(cell.date);
          const intensity = l.minutes / maxMinutes;
          const isToday = cell.date === todayISO();
          return (
            <button
              key={i}
              type="button"
              className={`calendar-cell ${selected === cell.date ? 'selected' : ''} ${isToday ? 'today' : ''}`}
              onClick={() => setSelected(cell.date)}
              style={{ background: l.minutes > 0 ? `rgba(208, 188, 255, ${0.12 + intensity * 0.62})` : undefined }}
              title={`${cell.date} · ${Math.round(l.minutes)} min · ${l.sets} series`}
            >
              <span className="calendar-day">{cell.day}</span>
              <span className="calendar-cell-meta">
                {l.count > 0 && <span>{l.count}</span>}
                {prDates.has(cell.date) && <span className="calendar-pr">★</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span className="muted">Intensidad por minutos de entrenamiento</span>
        <div className="heatmap-scale">
          <span>Menos</span>
          <div className="heatmap-gradient" />
          <span>Más</span>
        </div>
      </div>
      {sel && (
        <div className="calendar-detail">
          <div className="calendar-detail-head">
            <strong>{formatShort(selected!)}</strong>
            {sel.prs.length > 0 && <span className="badge badge-warning">★ {sel.prs.length} marca(s)</span>}
          </div>
          {sel.sessions.length === 0 && sel.workouts.length === 0 && <p className="muted">Sin entrenamientos este día.</p>}
          {sel.sessions.map((s) => (
            <div key={s.id} className="calendar-session">
              <span>Sesión · {Math.round(s.duration / 60)} min</span>
              <span className="muted">{s.entries.length} ejercicios</span>
            </div>
          ))}
          {sel.workouts.map((w) => (
            <div key={w.id} className="calendar-session">
              <span>{w.name}</span>
              <span className="muted">{w.entries.length} ejercicios</span>
            </div>
          ))}
          {sel.prs.map((p) => (
            <div key={`${p.date}-${p.exerciseId}`} className="calendar-session">
              <span>★ {p.name || exerciseMap.get(p.exerciseId)?.name}</span>
              <span className="muted">{p.weight} kg × {p.reps}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MiniSparkline({ values, color = 'var(--primary)' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const w = 180;
  const h = 44;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 4 - ((v - min) / span) * (h - 8)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sparkline" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WeekBars({ points }: { points: Array<{ label: string; value: number }> }) {
  return <BarChart items={points.map((p) => ({ label: p.label, value: p.value }))} />;
}

export { addDays, parseISO, weekKey };
