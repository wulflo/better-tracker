import React, { useMemo, useState } from 'react';
import type { VaultEvent } from '../types';
import { bodyProgressSeries, formatShort } from '../metrics';
import { Icon } from './Icons';
import { LineChart } from './Charts';
import { tx, useLanguage } from '../i18n';

type ProgressMetric = 'bodyFat' | 'fatMass' | 'waist';

function metricsFor(lang: 'es' | 'en') {
  return [
    { key: 'bodyFat' as const, label: tx(lang, 'Grasa estimada', 'Estimated fat'), short: tx(lang, '% grasa', '% fat'), unit: '%', decimals: 1, color: 'var(--primary)' },
    { key: 'fatMass' as const, label: tx(lang, 'Masa grasa', 'Fat mass'), short: tx(lang, 'Masa grasa', 'Fat mass'), unit: ' kg', decimals: 1, color: 'var(--warning)' },
    { key: 'waist' as const, label: tx(lang, 'Cintura', 'Waist'), short: tx(lang, 'Cintura', 'Waist'), unit: ' cm', decimals: 1, color: 'var(--info)' },
  ];
}

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
  const { lang } = useLanguage();
  const METRICS = useMemo(() => metricsFor(lang), [lang]);
  const series = useMemo(() => bodyProgressSeries(events), [events]);
  const available = METRICS.filter((metric) => series.some((point) => point[metric.key] !== null));
  const [selected, setSelected] = useState<ProgressMetric>('bodyFat');
  const metric = available.find((item) => item.key === selected) ?? available[0];

  if (!metric) {
    return (
      <section className={`card ${className}`.trim()}>
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="flame" /> {tx(lang, 'Descenso de grasa', 'Fat loss')}</div>
            <div className="card-sub">
              {tx(
                lang,
                'Puedes seguir la grasa sin báscula: cintura + altura activan RFM.',
                'You can track fat without a scale: waist + height enable RFM.',
              )}
            </div>
          </div>
          <span className="badge badge-muted">{tx(lang, 'Sin medidas', 'No measurements')}</span>
        </div>
        <div className="card-body">
          <div className="chart-empty">
            {tx(lang, 'Guarda al menos una medida corporal en ', 'Save at least one body measurement in ')}
            <strong>{tx(lang, 'Figura corporal', 'Body')}</strong>
            {tx(lang, ' para empezar la tendencia.', ' to start the trend.')}
            <div className="small" style={{ marginTop: 6 }}>
              {tx(
                lang,
                'El % de grasa se estima con cintura, altura, edad y sexo. La masa grasa en kg también necesita el peso.',
                'Body fat % is estimated from waist, height, age and sex. Fat mass in kg also needs weight.',
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const points = series
    .filter((point) => point[metric.key] !== null)
    .map((point) => ({
      label: formatShort(point.date, lang),
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
          <div className="card-title"><Icon name="flame" /> {tx(lang, 'Descenso de grasa', 'Fat loss')}</div>
          <div className="card-sub">
            {tx(
              lang,
              'Tendencia a partir de tus medidas guardadas. Sin báscula, usa % de grasa o cintura.',
              'Trend from your saved measurements. Without a scale, use body fat % or waist.',
            )}
          </div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {delta !== null && (
            <span className={`badge ${improving ? 'badge-success' : delta === 0 ? 'badge-muted' : 'badge-warning'}`}>
              {deltaLabel(metric.key, delta)} {tx(lang, 'desde la primera medida', 'since first measurement')}
            </span>
          )}
          <span className="badge badge-muted">
            {points.length} {tx(lang, 'medida(s)', 'measurement(s)')}
          </span>
        </div>
      </div>
      <div className="card-body stack">
        <div className="fat-tabs" role="tablist" aria-label={tx(lang, 'Métrica de progreso corporal', 'Body progress metric')}>
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
            <div className="metric-label">
              {metric.label} {tx(lang, 'más reciente', 'latest')}
            </div>
            <div className="fat-value">
              {latest !== undefined ? `${latest.toFixed(metric.decimals)}${metric.unit}` : '—'}
            </div>
            <div className="metric-caption">
              {delta !== null
                ? improving
                  ? tx(lang, 'La tendencia baja: mantén el proceso.', 'The trend is going down: keep it up.')
                  : delta === 0
                    ? tx(lang, 'Sin cambios entre la primera y la última medida.', 'No change between first and last measurement.')
                    : tx(lang, 'La tendencia sube; revisa el contexto antes de sacar conclusiones.', 'The trend is going up; check the context before drawing conclusions.')
                : tx(lang, 'Necesitas al menos dos medidas para ver la tendencia.', 'You need at least two measurements to see the trend.')}
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
          {tx(
            lang,
            'Cada punto es una medición guardada. El % grasa combina los métodos disponibles; la masa grasa requiere peso. Son estimaciones orientativas, no diagnóstico médico.',
            'Each point is a saved measurement. Body fat % combines the available methods; fat mass requires weight. These are estimates, not medical diagnosis.',
          )}
        </p>
      </div>
    </section>
  );
}
