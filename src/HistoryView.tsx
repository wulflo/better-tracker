import React, { useMemo, useState } from 'react';
import type { Exercise, PR, Routine, Session, VaultEvent, Workout } from './types';
import { EMPTY_MEASURES } from './types';
import { appendEvent, newEvent } from './vault';
import {
  activityLevelFromEvents,
  averageStepsFromEvents,
  computeMacros,
  computeWaterGuidance,
  formatShort,
  goalModeFromEvents,
  latestMeasurement,
  minutesLabel,
  reducePRs,
  reduceRoutines,
  reduceSessions,
  reduceWeights,
  reduceWorkouts,
  trainingSummary,
  visibleTrainingEvents,
} from './metrics';
import { dailyNutrition, nutritionDigest, type NutritionTargets } from './nutrition';
import { Icon } from './components/Icons';
import { EmptyState, Stat } from './components/Fields';
import { ProgressBar } from './components/Charts';
import { tx, useLanguage, plural, formatNumber } from './i18n';

interface Props {
  deviceId: string;
  events: VaultEvent[];
  exercises: Exercise[];
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

type Filter = 'all' | 'sessions' | 'workouts' | 'prs';

interface Row {
  id: string;
  date: string;
  timestamp: string;
  kind: 'session' | 'workout' | 'pr';
  session?: Session;
  workout?: Workout;
  pr?: PR;
}

export default function HistoryView({ deviceId, events, exercises, onRefresh, notify }: Props) {
  const { lang } = useLanguage();
  const [filter, setFilter] = useState<Filter>('all');
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<'training' | 'nutrition'>('training');

  const routines = useMemo(() => reduceRoutines(events), [events]);
  const sessions = useMemo(() => reduceSessions(events), [events]);
  const workouts = useMemo(() => reduceWorkouts(events), [events]);
  const prs = useMemo(() => reducePRs(events), [events]);
  const exerciseMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const nutritionEntries = useMemo(() => dailyNutrition(events), [events]);
  const lastMeas = useMemo(() => latestMeasurement(events), [events]);
  const weightEntries = useMemo(() => reduceWeights(events), [events]);
  const currentWeight =
    (weightEntries.length ? weightEntries[weightEntries.length - 1].kg : 0) || lastMeas?.weight || 0;
  const body = useMemo(
    () => ({ ...EMPTY_MEASURES, ...(lastMeas ?? {}), weight: currentWeight }),
    [lastMeas, currentWeight],
  );
  const exerciseSummary = useMemo(() => trainingSummary(events, exercises), [events, exercises]);
  const avgSteps = useMemo(() => averageStepsFromEvents(events), [events]);
  const nutritionTargets = useMemo<NutritionTargets | undefined>(() => {
    const macros = computeMacros(
      body,
      exerciseSummary.weekMinutes,
      goalModeFromEvents(events),
      activityLevelFromEvents(events),
      'es',
      avgSteps,
    );
    if (!macros) return undefined;
    const water = computeWaterGuidance(body, exerciseSummary.weekMinutes, 0);
    return {
      kcal: macros.kcal,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      fiber: macros.fiber,
      water: water.targetMl,
    };
  }, [body, exerciseSummary.weekMinutes, events, avgSteps]);
  const nutrition = useMemo(
    () => nutritionDigest(nutritionEntries, 8, new Date(), nutritionTargets, currentWeight, lang),
    [nutritionEntries, nutritionTargets, currentWeight, lang],
  );

  const rows = useMemo<Row[]>(() => {
    const visible = visibleTrainingEvents(events);
    const list: Row[] = [];
    for (const ev of visible) {
      if (ev.kind === 'session.saved') {
        const s = ev.payload as Session;
        list.push({ id: ev.id, date: s.date, timestamp: ev.timestamp, kind: 'session', session: s });
      } else if (ev.kind === 'workout.saved') {
        const w = ev.payload as Workout;
        list.push({ id: ev.id, date: w.date, timestamp: ev.timestamp, kind: 'workout', workout: w });
      } else if (ev.kind === 'pr.achieved') {
        const p = ev.payload as PR;
        list.push({ id: ev.id, date: p.date, timestamp: ev.timestamp, kind: 'pr', pr: p });
      }
    }
    return list.sort((a, b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp));
  }, [events]);

  const filtered = rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'sessions') return r.kind === 'session';
    if (filter === 'workouts') return r.kind === 'workout';
    return r.kind === 'pr';
  });

  const totalVolume = [...sessions, ...workouts].reduce(
    (a, s) => a + s.entries.reduce((b, e) => b + e.sets.reduce((c, x) => c + x.reps * x.weight, 0), 0),
    0,
  );
  const totalMinutes = sessions.reduce((a, s) => a + s.duration / 60, 0) +
    workouts.reduce((a, w) => a + w.entries.reduce((b, e) => b + e.sets.length * 3, 0), 0);
  const totalSets = [...sessions, ...workouts].reduce((a, s) => a + s.entries.reduce((b, e) => b + e.sets.length, 0), 0);

  const clearHistory = async () => {
    await appendEvent(newEvent(deviceId, 'history.cleared', { at: new Date().toISOString() }));
    setConfirm(false);
    await onRefresh();
    notify(
      tx(
        lang,
        'Historial vaciado. Los datos antiguos quedan archivados en la bóveda append-only.',
        'History cleared. Old data remains archived in the append-only vault.',
      ),
      'success',
    );
  };

  const routineName = (id?: string | null) => routines.find((r) => r.id === id)?.name;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{tx(lang, 'Historial', 'History')}</h1>
          <p className="page-sub">
            {tx(
              lang,
              'Sesiones, entrenamientos registrados y marcas personales. El botón de vaciar oculta todo el historial visible.',
              'Sessions, logged workouts and personal records. The clear button hides the entire visible history.',
            )}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-danger" onClick={() => setConfirm(true)} disabled={rows.length === 0}>
            <Icon name="trash" size={15} /> {tx(lang, 'Vaciar historial', 'Clear history')}
          </button>
        </div>
      </header>

      <div className="row between wrap">
        <div className="segmented" role="tablist" aria-label={tx(lang, 'Historial de entrenamiento o nutrición', 'Training or nutrition history')}>
          <button type="button" className={`segment ${tab === 'training' ? 'active' : ''}`} onClick={() => setTab('training')}>
            {tx(lang, 'Entrenamiento', 'Training')}
          </button>
          <button type="button" className={`segment ${tab === 'nutrition' ? 'active' : ''}`} onClick={() => setTab('nutrition')}>
            {tx(lang, 'Nutrición', 'Nutrition')}
          </button>
        </div>
        <span className="hint">
          {tab === 'training'
            ? tx(lang, 'Sesiones, entrenamientos y marcas personales.', 'Sessions, workouts and personal records.')
            : tx(lang, 'Solo se promedian los días con registro; una semana incompleta no penaliza.', 'Only logged days are averaged; an incomplete week is not penalized.')}
        </span>
      </div>

      {tab === 'nutrition' && (
        <div className="stack">
          <div className="grid grid-4">
            <Stat
              label={tx(lang, 'Días registrados', 'Logged days')}
              value={nutrition.loggedDays}
              caption={tx(lang, `de los últimos ${nutrition.weeks.length * 7} días`, `of the last ${nutrition.weeks.length * 7} days`)}
            />
            <Stat
              label={tx(lang, 'Media de calorías', 'Average calories')}
              value={`${formatNumber(nutrition.avg.kcal, lang)}`}
              caption={
                nutritionTargets
                  ? tx(
                      lang,
                      `Objetivo ${formatNumber(nutritionTargets.kcal, lang)} kcal · ${nutrition.adherencePct ?? 0}% de adherencia`,
                      `Target ${formatNumber(nutritionTargets.kcal, lang)} kcal · ${nutrition.adherencePct ?? 0}% adherence`,
                    )
                  : tx(lang, 'Añade peso y altura para comparar con el objetivo', 'Add weight and height to compare with the target')
              }
            />
            <Stat
              label={tx(lang, 'Rango de calorías', 'Calorie range')}
              value={`${formatNumber(nutrition.min.min, lang)}–${formatNumber(nutrition.min.max, lang)}`}
              caption={tx(lang, 'mínimo y máximo de los días con log', 'minimum and maximum of logged days')}
            />
            <Stat
              label={tx(lang, 'Racha de registro', 'Logging streak')}
              value={tx(
                lang,
                `${nutrition.longestStreak} ${plural(lang, nutrition.longestStreak, 'día', 'días')}`,
                `${nutrition.longestStreak} ${plural(lang, nutrition.longestStreak, 'day', 'days')}`,
              )}
              caption={nutrition.bestWeek ? tx(lang, `Mejor semana: ${nutrition.bestWeek.label}`, `Best week: ${nutrition.bestWeek.label}`) : tx(lang, 'Sin datos suficientes', 'Not enough data')}
            />
          </div>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title"><Icon name="chart" /> {tx(lang, 'Promedios y rangos por macro', 'Averages and ranges per macro')}</div>
                <div className="card-sub">
                  {tx(
                    lang,
                    'Cada valor se calcula solo con días que tienen log. El rango muestra la variabilidad real, no una media que esconde los extremos.',
                    'Each value is calculated only from logged days. The range shows real variability, not an average that hides the extremes.',
                  )}
                </div>
              </div>
              {nutritionTargets && <span className="badge badge-primary">{tx(lang, 'Objetivo:', 'Target:')} {formatNumber(nutritionTargets.kcal, lang)} kcal</span>}
            </div>
            <div className="card-body">
              <div className="nutrition-table">
                <div className="nutrition-row nutrition-head">
                  <span>{tx(lang, 'Macro', 'Macro')}</span><span>{tx(lang, 'Media', 'Average')}</span><span>{tx(lang, 'Mín.', 'Min.')}</span><span>{tx(lang, 'Máx.', 'Max.')}</span><span>{tx(lang, 'Objetivo', 'Target')}</span>
                </div>
                {([
                  [tx(lang, 'Calorías', 'Calories'), nutrition.avg.kcal, nutrition.ranges.kcal.min, nutrition.ranges.kcal.max, nutritionTargets?.kcal, 'kcal'],
                  [tx(lang, 'Proteína', 'Protein'), nutrition.avg.protein, nutrition.ranges.protein.min, nutrition.ranges.protein.max, nutritionTargets?.protein, 'g'],
                  [tx(lang, 'Carbohidratos', 'Carbs'), nutrition.avg.carbs, nutrition.ranges.carbs.min, nutrition.ranges.carbs.max, nutritionTargets?.carbs, 'g'],
                  [tx(lang, 'Grasas', 'Fat'), nutrition.avg.fat, nutrition.ranges.fat.min, nutrition.ranges.fat.max, nutritionTargets?.fat, 'g'],
                  [tx(lang, 'Fibra', 'Fiber'), nutrition.avg.fiber, nutrition.ranges.fiber.min, nutrition.ranges.fiber.max, nutritionTargets?.fiber, 'g'],
                  [tx(lang, 'Agua', 'Water'), nutrition.avg.water, nutrition.ranges.water.min, nutrition.ranges.water.max, nutritionTargets?.water, 'ml'],
                ] as Array<[string, number, number, number, number | undefined, string]>).map(([label, avg, min, max, target, unit]) => (
                  <div key={label} className="nutrition-row">
                    <span>{label}</span>
                    <strong>{formatNumber(Math.round(avg), lang)} {unit}</strong>
                    <span className="muted">{nutrition.loggedDays > 0 ? formatNumber(Math.round(min), lang) : '—'}</span>
                    <span className="muted">{nutrition.loggedDays > 0 ? formatNumber(Math.round(max), lang) : '—'}</span>
                    <span className="muted">{target !== undefined ? `${formatNumber(Math.round(target), lang)} ${unit}` : '—'}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-2" style={{ gap: 12, marginTop: 14 }}>
                <ProgressBar
                  label={tx(lang, 'Adherencia calórica (±10 %)', 'Calorie adherence (±10%)')}
                  valueLabel={nutrition.adherencePct !== null ? `${nutrition.adherencePct}%` : tx(lang, 'Sin objetivo', 'No target')}
                  value={nutrition.adherencePct ?? 0}
                />
                <ProgressBar
                  label={tx(lang, 'Días registrados', 'Logged days')}
                  valueLabel={`${nutrition.loggedDays}/${nutrition.weeks.length * 7}`}
                  value={nutrition.loggedDays}
                  max={Math.max(1, nutrition.weeks.length * 7)}
                />
              </div>
              {nutrition.avg.min !== nutrition.avg.max && (
                <p className="hint" style={{ marginTop: 10 }}>
                  {tx(
                    lang,
                    `Rango calórico de los días registrados: ${formatNumber(nutrition.min.min, lang)}–${formatNumber(nutrition.min.max, lang)} kcal. La variabilidad extrema sugiere revisar los fines de semana o los días sin planificar.`,
                    `Calorie range of logged days: ${formatNumber(nutrition.min.min, lang)}–${formatNumber(nutrition.min.max, lang)} kcal. Extreme variability suggests reviewing weekends or unplanned days.`,
                  )}
                </p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title"><Icon name="calendar" /> {tx(lang, 'Últimas 8 semanas', 'Last 8 weeks')}</div>
                <div className="card-sub">
                  {tx(
                    lang,
                    'Solo aparecen semanas con al menos un día registrado. Las medias dividen por días con log.',
                    'Only weeks with at least one logged day appear. Averages divide by logged days.',
                  )}
                </div>
              </div>
            </div>
            <div className="card-body stack">
              {nutrition.loggedDays === 0 ? (
                <EmptyState
                  icon={<Icon name="bowl" />}
                  title={tx(lang, 'Sin registros de nutrición', 'No nutrition entries')}
                  sub={tx(lang, 'Guarda la ingesta desde el Panel para ver promedios, rangos y sugerencias.', 'Log your intake from the Dashboard to see averages, ranges and suggestions.')}
                />
              ) : (
                nutrition.weeks.map((week) => (
                  <div key={week.key} className={`nutrition-week ${week.loggedDays ? '' : 'empty'}`}>
                    <div className="nutrition-week-head">
                      <strong>{week.label}</strong>
                      <span className="hint small">
                        {tx(
                          lang,
                          `${week.loggedDays} ${plural(lang, week.loggedDays, 'día', 'días')} · ${formatNumber(Math.round(week.kcal.avg), lang)} kcal medias`,
                          `${week.loggedDays} ${plural(lang, week.loggedDays, 'day', 'days')} · ${formatNumber(Math.round(week.kcal.avg), lang)} kcal average`,
                        )}
                        {week.adherencePct !== null ? ` · ${week.adherencePct}% ${tx(lang, 'en objetivo', 'within target')}` : ''}
                      </span>
                    </div>
                    {week.loggedDays > 0 ? (
                      <>
                        <div className="nutrition-week-bar">
                          <div
                            style={{
                              width: `${Math.min(100, Math.round((week.kcal.avg / Math.max(1, nutritionTargets?.kcal ?? Math.max(...nutrition.weeks.map((w) => w.kcal.max), 1))) * 100))}%`,
                            }}
                          />
                        </div>
                        <div className="chips">
                          <span className="chip">P {formatNumber(Math.round(week.protein.avg), lang)} g</span>
                          <span className="chip">C {formatNumber(Math.round(week.carbs.avg), lang)} g</span>
                          <span className="chip">{tx(lang, 'G', 'F')} {formatNumber(Math.round(week.fat.avg), lang)} g</span>
                          <span className="chip">{tx(lang, 'Fibra', 'Fiber')} {formatNumber(Math.round(week.fiber.avg), lang)} g</span>
                          <span className="chip">{tx(lang, 'Agua', 'Water')} {formatNumber(week.water.avg / 1000, lang, 1)} L</span>
                          <span className="chip">{tx(lang, 'Rango', 'Range')} {formatNumber(week.kcal.min, lang)}–{formatNumber(week.kcal.max, lang)} kcal</span>
                        </div>
                      </>
                    ) : (
                      <span className="hint small">{tx(lang, 'Sin registros.', 'No entries.')}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title"><Icon name="spark" /> {tx(lang, 'Sugerencias de mejora', 'Improvement suggestions')}</div>
                <div className="card-sub">
                  {tx(
                    lang,
                    'Generadas a partir de tus medias frente a los objetivos y de la constancia del registro.',
                    'Generated from your averages against targets and from logging consistency.',
                  )}
                </div>
              </div>
            </div>
            <div className="card-body stack">
              {nutrition.tips.map((tip, index) => (
                <div key={index} className="notice notice-info">
                  <Icon name="info" size={16} />
                  <span>{tip}</span>
                </div>
              ))}
              {nutrition.longestStreak > 0 && (
                <div className="notice notice-success">
                  <Icon name="check" size={16} />
                  <span>
                    {tx(
                      lang,
                      `Llevas ${nutrition.longestStreak} ${plural(lang, nutrition.longestStreak, 'día', 'días')} consecutivo${nutrition.longestStreak === 1 ? '' : 's'} registrando. La constancia es el mejor predictor de resultados.`,
                      `You have logged ${nutrition.longestStreak} consecutive ${plural(lang, nutrition.longestStreak, 'day', 'days')}. Consistency is the best predictor of results.`,
                    )}
                  </span>
                </div>
              )}
            </div>
          </section>

          {nutritionEntries.length > 0 && (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title"><Icon name="history" /> {tx(lang, 'Días con registro', 'Logged days')}</div>
                  <div className="card-sub">
                    {tx(lang, 'Los días sin log no aparecen ni cuentan en los promedios.', 'Days without a log do not appear or count toward averages.')}
                  </div>
                </div>
                <span className="badge badge-muted">
                  {tx(
                    lang,
                    `${nutritionEntries.length} ${plural(lang, nutritionEntries.length, 'día', 'días')}`,
                    `${nutritionEntries.length} ${plural(lang, nutritionEntries.length, 'day', 'days')}`,
                  )}
                </span>
              </div>
              <div className="card-body">
                <div className="nutrition-table">
                  <div className="nutrition-row nutrition-head">
                    <span>{tx(lang, 'Fecha', 'Date')}</span><span>kcal</span><span>{tx(lang, 'Proteína', 'Protein')}</span><span>{tx(lang, 'Carbos', 'Carbs')}</span><span>{tx(lang, 'Grasa', 'Fat')}</span><span>{tx(lang, 'Agua', 'Water')}</span>
                  </div>
                  {nutritionEntries.slice(-14).reverse().map((entry) => (
                    <div key={entry.date} className="nutrition-row">
                      <span>{formatShort(entry.date, lang)}</span>
                      <strong>{formatNumber(Math.round(entry.kcal), lang)}</strong>
                      <span>{formatNumber(Math.round(entry.protein), lang)} g</span>
                      <span>{formatNumber(Math.round(entry.carbs), lang)} g</span>
                      <span>{formatNumber(Math.round(entry.fat), lang)} g</span>
                      <span>{formatNumber(entry.water / 1000, lang, 1)} L</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'training' && (
        <>
      <div className="grid grid-4">
        <div className="metric">
          <div className="metric-label">{tx(lang, 'Sesiones', 'Sessions')}</div>
          <div className="metric-value-lg">{sessions.length}</div>
          <div className="metric-caption">
            {tx(
              lang,
              `${workouts.length} ${plural(lang, workouts.length, 'entrenamiento', 'entrenamientos')}`,
              `${workouts.length} ${plural(lang, workouts.length, 'workout', 'workouts')}`,
            )}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">{tx(lang, 'Series totales', 'Total sets')}</div>
          <div className="metric-value-lg">{totalSets}</div>
          <div className="metric-caption">{tx(lang, 'Series registradas', 'Logged sets')}</div>
        </div>
        <div className="metric">
          <div className="metric-label">{tx(lang, 'Tiempo', 'Time')}</div>
          <div className="metric-value-lg">{minutesLabel(totalMinutes)}</div>
          <div className="metric-caption">{tx(lang, 'Duración acumulada', 'Total duration')}</div>
        </div>
        <div className="metric">
          <div className="metric-label">{tx(lang, 'Volumen', 'Volume')}</div>
          <div className="metric-value-lg">{formatNumber(Math.round(totalVolume), lang)}</div>
          <div className="metric-caption">{tx(lang, 'kg · reps × carga', 'kg · reps × load')}</div>
        </div>
      </div>

      <div className="row between wrap">
        <div className="segmented" role="tablist" aria-label={tx(lang, 'Filtrar historial', 'Filter history')}>
          {([
            ['all', tx(lang, `Todo (${rows.length})`, `All (${rows.length})`)],
            ['sessions', tx(lang, `Sesiones (${sessions.length})`, `Sessions (${sessions.length})`)],
            ['workouts', tx(lang, `Entrenamientos (${workouts.length})`, `Workouts (${workouts.length})`)],
            ['prs', tx(lang, `Marcas (${prs.length})`, `PRs (${prs.length})`)],
          ] as Array<[Filter, string]>).map(([id, label]) => (
            <button key={id} type="button" className={`segment ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <span className="hint">{tx(lang, 'Las marcas se detectan automáticamente al finalizar una sesión.', 'PRs are detected automatically when you finish a session.')}</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Icon name="history" />}
          title={rows.length === 0 ? tx(lang, 'Historial vacío', 'Empty history') : tx(lang, 'Sin resultados', 'No results')}
          sub={rows.length === 0 ? tx(lang, 'Registra una sesión o entrenamiento para empezar el historial.', 'Log a session or workout to start your history.') : tx(lang, 'Prueba otro filtro.', 'Try another filter.')}
        />
      ) : (
        <div className="stack">
          {filtered.map((row) => {
            if (row.kind === 'pr' && row.pr) {
              return (
                <div key={row.id} className="list-item">
                  <div className="list-item-main">
                    <span className="list-item-title"><Icon name="spark" size={12} /> {tx(lang, 'Marca personal', 'Personal record')} · {exerciseMap.get(row.pr.exerciseId)?.name ?? row.pr.name}</span>
                    <span className="list-item-sub">{formatShort(row.pr.date, lang)} · {formatNumber(row.pr.weight, lang)} kg × {formatNumber(row.pr.reps, lang)} {tx(lang, 'reps', 'reps')}</span>
                  </div>
                  <span className="badge badge-warning">PR</span>
                </div>
              );
            }
            if (row.kind === 'session' && row.session) {
              const s = row.session;
              const sets = s.entries.reduce((a, e) => a + e.sets.length, 0);
              const volume = s.entries.reduce((a, e) => a + e.sets.reduce((b, x) => b + x.reps * x.weight, 0), 0);
              return (
                <div key={row.id} className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title"><Icon name="dumbbell" /> {routineName(s.routineId) || tx(lang, 'Sesión libre', 'Freestyle session')}</div>
                      <div className="card-sub">
                        {tx(
                          lang,
                          `${formatShort(s.date, lang)} · ${Math.round(s.duration / 60)} min · ${sets} ${plural(lang, sets, 'serie', 'series')} · ${formatNumber(Math.round(volume), lang)} kg`,
                          `${formatShort(s.date, lang)} · ${Math.round(s.duration / 60)} min · ${sets} ${plural(lang, sets, 'set', 'sets')} · ${formatNumber(Math.round(volume), lang)} kg`,
                        )}
                      </div>
                    </div>
                    <span className="badge badge-primary">{tx(lang, 'Sesión', 'Session')}</span>
                  </div>
                  <div className="card-body">
                    <div className="chips">
                      {s.entries.map((entry) => {
                        const ex = exerciseMap.get(entry.exerciseId);
                        return (
                          <span key={entry.exerciseId} className="chip">
                            {ex?.name ?? tx(lang, 'Ejercicio', 'Exercise')} · {entry.sets.length}×
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }
            if (row.kind === 'workout' && row.workout) {
              const w = row.workout;
              const sets = w.entries.reduce((a, e) => a + e.sets.length, 0);
              return (
                <div key={row.id} className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title"><Icon name="check" /> {w.name}</div>
                      <div className="card-sub">
                        {tx(
                          lang,
                          `${formatShort(w.date, lang)} · ${sets} ${plural(lang, sets, 'serie', 'series')}`,
                          `${formatShort(w.date, lang)} · ${sets} ${plural(lang, sets, 'set', 'sets')}`,
                        )}
                      </div>
                    </div>
                    <span className="badge badge-muted">{tx(lang, 'Entrenamiento', 'Workout')}</span>
                  </div>
                  <div className="card-body">
                    <div className="chips">
                      {w.entries.map((entry) => {
                        const ex = exerciseMap.get(entry.exerciseId);
                        return (
                          <span key={entry.exerciseId} className="chip">
                            {ex?.name ?? tx(lang, 'Ejercicio', 'Exercise')} · {entry.sets.length}×
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
        </>
      )}

      {confirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="clear-title">
          <div className="modal" style={{ width: 'min(480px, 100%)' }}>
            <div className="modal-header">
              <strong className="modal-title" id="clear-title">{tx(lang, '¿Vaciar el historial?', 'Clear history?')}</strong>
              <button className="btn-icon" aria-label={tx(lang, 'Cerrar', 'Close')} onClick={() => setConfirm(false)}><Icon name="close" size={16} /></button>
            </div>
            <div className="modal-body">
              <p className="small">
                {tx(
                  lang,
                  `Se ocultarán ${sessions.length} ${plural(lang, sessions.length, 'sesión', 'sesiones')}, ${workouts.length} ${plural(lang, workouts.length, 'entrenamiento', 'entrenamientos')} y ${prs.length} ${plural(lang, prs.length, 'marca', 'marcas')} de la interfaz. Las rutinas, el plan, las medidas y la biblioteca de ejercicios se conservan.`,
                  `This will hide ${sessions.length} ${plural(lang, sessions.length, 'session', 'sessions')}, ${workouts.length} ${plural(lang, workouts.length, 'workout', 'workouts')} and ${prs.length} ${plural(lang, prs.length, 'PR', 'PRs')} from the interface. Routines, the plan, measurements and the exercise library are kept.`,
                )}
              </p>
              <div className="notice notice-warn">
                <Icon name="info" size={16} />
                <span>
                  {tx(
                    lang,
                    'La bóveda es append-only: los eventos antiguos permanecen en el archivo para no romper el registro, pero dejan de mostrarse y de contar en gráficos y alertas.',
                    'The vault is append-only: old events remain in the file so the log stays intact, but they stop being shown and counted in charts and alerts.',
                  )}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirm(false)}>{tx(lang, 'Cancelar', 'Cancel')}</button>
              <button className="btn btn-danger" onClick={clearHistory}><Icon name="trash" size={15} /> {tx(lang, 'Vaciar historial', 'Clear history')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
