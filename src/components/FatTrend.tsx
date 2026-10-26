import React, { useMemo, useState } from 'react';
import type { VaultEvent } from '../types';
import { bodyProgressSeries, formatShort } from '../metrics';
import { Icon } from './Icons';
import { LineChart } from './Charts';

type ProgressMetric = 'bodyFat' | 'fatMass' | 'waist';

const METRICS: Array<{
  key: ProgressMetric;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  color: string;
}> = [
  { key: 'bodyFat', label: 'Grasa estimada', short: '% grasa', unit: '%', decimals: 1, color: 'var(--primary)' },
  { key: 'fatMass', label: 'Masa grasa', short: 'Masa grasa', unit: ' kg', decimals: 1, color: 'var(--warning)' },
  { key: 'waist', label: 'Cintura', short: 'Cintura', unit: ' cm', decimals: 1, color: 'var(--info)' },
];

function deltaLabel(key: ProgressMetric, delta: number): string {
  const sign = delta > 0 ? '+' : '−';
  const abs = Math.abs(delta);
  const value = abs.toFixed(1);
  return key === 'bodyFat' ? `${sign}${value} pts` : `${sign}${value}${key === 'fatMass' ? ' kg' : ' cm'}`;
}

export default function FatTrend({
  events,
  className = '',
}: {
  events: VaultEvent[];
  className?: string;
}) {
  const series = useMemo(() => bodyProgressSeries(events), [events]);
  const available = METRICS.filter((metric) => series.some((point) => point[metric.key] !== null));
  const [selected, setSelected] = useState<ProgressMetric>('bodyFat');
  const metric = available.find((item) => item.key === selected) ?? available[0];

  if (!metric) {
    return (
      <section className={`card ${className}`.trim()}>
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="flame" /> Descenso de grasa</div>
            <div className="card-sub">Puedes seguir la grasa sin báscula: cintura + altura activan RFM.</div>
          </div>
          <span className="badge badge-muted">Sin medidas</span>
        </div>
        <div className="card-body">
          <div className="chart-empty">
            Guarda al menos una medida corporal en <strong>Figura corporal</strong> para empezar la tendencia.
            <div className="small" style={{ marginTop: 6 }}>
              El % de grasa se estima con cintura, altura, edad y sexo. La masa grasa en kg también necesita el peso.
            </div>
          </div>
        </div>
      </section>
    );
  }

  const points = series
    .filter((point) => point[metric.key] !== null)
    .map((point) => ({
      label: formatShort(point.date),
      value: point[metric.key] as number,
    }));
  const first = points[0]?.value;
  const latest = points[points.length - 1]?.value;
  const delta = first !== undefined && latest !== undefined ? latest - first : null;
  const improving = delta !== null && delta < 0;

  return (
    <section className={`card ${className}`.trim()}>
      <div className="card-header">
        <div>
          <div className="card-title"><Icon name="flame" /> Descenso de grasa</div>
          <div className="card-sub">Tendencia a partir de tus medidas guardadas. Sin báscula, usa % de grasa o cintura.</div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {delta !== null && (
            <span className={`badge ${improving ? 'badge-success' : delta === 0 ? 'badge-muted' : 'badge-warning'}`}>
              {deltaLabel(metric.key, delta)} desde la primera medida
            </span>
          )}
          <span className="badge badge-muted">{points.length} medida(s)</span>
        </div>
      </div>
      <div className="card-body stack">
        <div className="fat-tabs" role="tablist" aria-label="Métrica de progreso corporal">
          {available.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`segment ${metric.key === item.key ? 'active' : ''}`}
              onClick={() => setSelected(item.key)}
            >
              {item.short}
            </button>
          ))}
        </div>

        <div className="fat-summary">
          <div>
            <div className="metric-label">{metric.label} más reciente</div>
            <div className="fat-value">
              {latest !== undefined ? `${latest.toFixed(metric.decimals)}${metric.unit}` : '—'}
            </div>
            <div className="metric-caption">
              {delta !== null
                ? improving
                  ? 'La tendencia baja: mantén el proceso.'
                  : delta === 0
                    ? 'Sin cambios entre la primera y la última medida.'
                    : 'La tendencia sube; revisa el contexto antes de sacar conclusiones.'
                : 'Necesitas al menos dos medidas para ver la tendencia.'}
            </div>
          </div>
          <div className="fat-delta" aria-hidden="true">
            <Icon name={improving ? 'chart' : delta === 0 ? 'info' : 'alert'} size={22} />
          </div>
        </div>

        <LineChart
          points={points}
          color={metric.color}
          height={190}
          suffix={metric.unit}
          decimals={metric.decimals}
          zeroBased={false}
        />

        <p className="hint">
          Cada punto es una medición guardada. El % grasa combina los métodos disponibles; la masa grasa requiere peso.
          Son estimaciones orientativas, no diagnóstico médico.
        </p>
      </div>
    </section>
  );
}
