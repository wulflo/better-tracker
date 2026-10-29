import React, { useMemo, useState } from 'react';
import type { Exercise, PR, Routine, Session, VaultEvent, Workout } from './types';
import { EMPTY_MEASURES } from './types';
import { appendEvent, newEvent } from './vault';
import {
  activityLevelFromEvents,
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
  const nutritionTargets = useMemo<NutritionTargets | undefined>(() => {
    const macros = computeMacros(
      body,
      exerciseSummary.weekMinutes,
      goalModeFromEvents(events),
      activityLevelFromEvents(events),
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
  }, [body, exerciseSummary.weekMinutes, events]);
  const nutrition = useMemo(
    () => nutritionDigest(nutritionEntries, 8, new Date(), nutritionTargets, currentWeight),
    [nutritionEntries, nutritionTargets, currentWeight],
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
    notify('Historial vaciado. Los datos antiguos quedan archivados en la bóveda append-only.', 'success');
  };

  const routineName = (id?: string | null) => routines.find((r) => r.id === id)?.name;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Historial</h1>
          <p className="page-sub">Sesiones, entrenamientos registrados y marcas personales. El botón de vaciar oculta todo el historial visible.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-danger" onClick={() => setConfirm(true)} disabled={rows.length === 0}>
            <Icon name="trash" size={15} /> Vaciar historial
          </button>
        </div>
      </header>

      <div className="row between wrap">
        <div className="segmented" role="tablist" aria-label="Historial de entrenamiento o nutrición">
          <button type="button" className={`segment ${tab === 'training' ? 'active' : ''}`} onClick={() => setTab('training')}>
            Entrenamiento
          </button>
          <button type="button" className={`segment ${tab === 'nutrition' ? 'active' : ''}`} onClick={() => setTab('nutrition')}>
            Nutrición
          </button>
        </div>
        <span className="hint">
          {tab === 'training'
            ? 'Sesiones, entrenamientos y marcas personales.'
            : 'Solo se promedian los días con registro; una semana incompleta no penaliza.'}
        </span>
      </div>

      {tab === 'nutrition' && (
        <div className="stack">
          <div className="grid grid-4">
            <Stat
              label="Días registrados"
              value={nutrition.loggedDays}
              caption={`de los últimos ${nutrition.weeks.length * 7} días`}
            />
            <Stat
              label="Media de calorías"
              value={`${nutrition.avg.kcal}`}
              caption={
                nutritionTargets
                  ? `Objetivo ${nutritionTargets.kcal} kcal · ${nutrition.adherencePct ?? 0}% de adherencia`
                  : 'Añade peso y altura para comparar con el objetivo'
              }
            />
            <Stat
              label="Rango de calorías"
              value={`${nutrition.min.min}–${nutrition.min.max}`}
              caption="mínimo y máximo de los días con log"
            />
            <Stat
              label="Racha de registro"
              value={`${nutrition.longestStreak} día${nutrition.longestStreak === 1 ? '' : 's'}`}
              caption={nutrition.bestWeek ? `Mejor semana: ${nutrition.bestWeek.label}` : 'Sin datos suficientes'}
            />
          </div>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title"><Icon name="chart" /> Promedios y rangos por macro</div>
                <div className="card-sub">
                  Cada valor se calcula solo con días que tienen log. El rango muestra la variabilidad real, no una
                  media que esconde los extremos.
                </div>
              </div>
              {nutritionTargets && <span className="badge badge-primary">Objetivo: {nutritionTargets.kcal} kcal</span>}
            </div>
            <div className="card-body">
              <div className="nutrition-table">
                <div className="nutrition-row nutrition-head">
                  <span>Macro</span><span>Media</span><span>Mín.</span><span>Máx.</span><span>Objetivo</span>
                </div>
                {([
                  ['Calorías', nutrition.avg.kcal, nutrition.ranges.kcal.min, nutrition.ranges.kcal.max, nutritionTargets?.kcal, 'kcal'],
                  ['Proteína', nutrition.avg.protein, nutrition.ranges.protein.min, nutrition.ranges.protein.max, nutritionTargets?.protein, 'g'],
                  ['Carbohidratos', nutrition.avg.carbs, nutrition.ranges.carbs.min, nutrition.ranges.carbs.max, nutritionTargets?.carbs, 'g'],
                  ['Grasas', nutrition.avg.fat, nutrition.ranges.fat.min, nutrition.ranges.fat.max, nutritionTargets?.fat, 'g'],
                  ['Fibra', nutrition.avg.fiber, nutrition.ranges.fiber.min, nutrition.ranges.fiber.max, nutritionTargets?.fiber, 'g'],
                  ['Agua', nutrition.avg.water, nutrition.ranges.water.min, nutrition.ranges.water.max, nutritionTargets?.water, 'ml'],
                ] as Array<[string, number, number, number, number | undefined, string]>).map(([label, avg, min, max, target, unit]) => (
                  <div key={label} className="nutrition-row">
                    <span>{label}</span>
                    <strong>{Math.round(avg).toLocaleString('es')} {unit}</strong>
                    <span className="muted">{nutrition.loggedDays > 0 ? Math.round(min).toLocaleString('es') : '—'}</span>
                    <span className="muted">{nutrition.loggedDays > 0 ? Math.round(max).toLocaleString('es') : '—'}</span>
                    <span className="muted">{target !== undefined ? `${Math.round(target).toLocaleString('es')} ${unit}` : '—'}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-2" style={{ gap: 12, marginTop: 14 }}>
                <ProgressBar
                  label="Adherencia calórica (±10 %)"
                  valueLabel={nutrition.adherencePct !== null ? `${nutrition.adherencePct}%` : 'Sin objetivo'}
                  value={nutrition.adherencePct ?? 0}
                />
                <ProgressBar
                  label="Días registrados"
                  valueLabel={`${nutrition.loggedDays}/${nutrition.weeks.length * 7}`}
                  value={nutrition.loggedDays}
                  max={Math.max(1, nutrition.weeks.length * 7)}
                />
              </div>
              {nutrition.avg.min !== nutrition.avg.max && (
                <p className="hint" style={{ marginTop: 10 }}>
                  Rango calórico de los días registrados: {nutrition.min.min}–{nutrition.min.max} kcal.
                  La variabilidad extrema sugiere revisar los fines de semana o los días sin planificar.
                </p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title"><Icon name="calendar" /> Últimas 8 semanas</div>
                <div className="card-sub">Solo aparecen semanas con al menos un día registrado. Las medias dividen por días con log.</div>
              </div>
            </div>
            <div className="card-body stack">
              {nutrition.loggedDays === 0 ? (
                <EmptyState
                  icon={<Icon name="bowl" />}
                  title="Sin registros de nutrición"
                  sub="Guarda la ingesta desde el Panel para ver promedios, rangos y sugerencias."
                />
              ) : (
                nutrition.weeks.map((week) => (
                  <div key={week.key} className={`nutrition-week ${week.loggedDays ? '' : 'empty'}`}>
                    <div className="nutrition-week-head">
                      <strong>{week.label}</strong>
                      <span className="hint small">
                        {week.loggedDays} día(s) · {Math.round(week.kcal.avg).toLocaleString('es')} kcal medias
                        {week.adherencePct !== null ? ` · ${week.adherencePct}% en objetivo` : ''}
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
                          <span className="chip">P {Math.round(week.protein.avg)} g</span>
                          <span className="chip">C {Math.round(week.carbs.avg)} g</span>
                          <span className="chip">G {Math.round(week.fat.avg)} g</span>
                          <span className="chip">Fibra {Math.round(week.fiber.avg)} g</span>
                          <span className="chip">Agua {(week.water.avg / 1000).toFixed(1)} L</span>
                          <span className="chip">Rango {week.kcal.min}–{week.kcal.max} kcal</span>
                        </div>
                      </>
                    ) : (
                      <span className="hint small">Sin registros.</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title"><Icon name="spark" /> Sugerencias de mejora</div>
                <div className="card-sub">Generadas a partir de tus medias frente a los objetivos y de la constancia del registro.</div>
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
                  <span>Llevas {nutrition.longestStreak} día(s) consecutivos registrando. La constancia es el mejor predictor de resultados.</span>
                </div>
              )}
            </div>
          </section>

          {nutritionEntries.length > 0 && (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title"><Icon name="history" /> Días con registro</div>
                  <div className="card-sub">Los días sin log no aparecen ni cuentan en los promedios.</div>
                </div>
                <span className="badge badge-muted">{nutritionEntries.length} día(s)</span>
              </div>
              <div className="card-body">
                <div className="nutrition-table">
                  <div className="nutrition-row nutrition-head">
                    <span>Fecha</span><span>kcal</span><span>Proteína</span><span>Carbos</span><span>Grasa</span><span>Agua</span>
                  </div>
                  {nutritionEntries.slice(-14).reverse().map((entry) => (
                    <div key={entry.date} className="nutrition-row">
                      <span>{formatShort(entry.date)}</span>
                      <strong>{Math.round(entry.kcal)}</strong>
                      <span>{Math.round(entry.protein)} g</span>
                      <span>{Math.round(entry.carbs)} g</span>
                      <span>{Math.round(entry.fat)} g</span>
                      <span>{(entry.water / 1000).toFixed(1)} L</span>
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
          <div className="metric-label">Sesiones</div>
          <div className="metric-value-lg">{sessions.length}</div>
          <div className="metric-caption">{workouts.length} entrenamientos</div>
        </div>
        <div className="metric">
          <div className="metric-label">Series totales</div>
          <div className="metric-value-lg">{totalSets}</div>
          <div className="metric-caption">Series registradas</div>
        </div>
        <div className="metric">
          <div className="metric-label">Tiempo</div>
          <div className="metric-value-lg">{minutesLabel(totalMinutes)}</div>
          <div className="metric-caption">Duración acumulada</div>
        </div>
        <div className="metric">
          <div className="metric-label">Volumen</div>
          <div className="metric-value-lg">{Math.round(totalVolume).toLocaleString('es')}</div>
          <div className="metric-caption">kg · reps × carga</div>
        </div>
      </div>

      <div className="row between wrap">
        <div className="segmented" role="tablist" aria-label="Filtrar historial">
          {([
            ['all', `Todo (${rows.length})`],
            ['sessions', `Sesiones (${sessions.length})`],
            ['workouts', `Entrenamientos (${workouts.length})`],
            ['prs', `Marcas (${prs.length})`],
          ] as Array<[Filter, string]>).map(([id, label]) => (
            <button key={id} type="button" className={`segment ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <span className="hint">Las marcas se detectan automáticamente al finalizar una sesión.</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Icon name="history" />}
          title={rows.length === 0 ? 'Historial vacío' : 'Sin resultados'}
          sub={rows.length === 0 ? 'Registra una sesión o entrenamiento para empezar el historial.' : 'Prueba otro filtro.'}
        />
      ) : (
        <div className="stack">
          {filtered.map((row) => {
            if (row.kind === 'pr' && row.pr) {
              return (
                <div key={row.id} className="list-item">
                  <div className="list-item-main">
                    <span className="list-item-title"><Icon name="spark" size={12} /> Marca personal · {row.pr.name}</span>
                    <span className="list-item-sub">{formatShort(row.pr.date)} · {row.pr.weight} kg × {row.pr.reps} reps</span>
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
                      <div className="card-title"><Icon name="dumbbell" /> {routineName(s.routineId) || 'Sesión libre'}</div>
                      <div className="card-sub">{formatShort(s.date)} · {Math.round(s.duration / 60)} min · {sets} series · {Math.round(volume).toLocaleString('es')} kg</div>
                    </div>
                    <span className="badge badge-primary">Sesión</span>
                  </div>
                  <div className="card-body">
                    <div className="chips">
                      {s.entries.map((entry) => {
                        const ex = exerciseMap.get(entry.exerciseId);
                        return (
                          <span key={entry.exerciseId} className="chip">
                            {ex?.name ?? 'Ejercicio'} · {entry.sets.length}×
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
                      <div className="card-sub">{formatShort(w.date)} · {sets} series</div>
                    </div>
                    <span className="badge badge-muted">Entrenamiento</span>
                  </div>
                  <div className="card-body">
                    <div className="chips">
                      {w.entries.map((entry) => {
                        const ex = exerciseMap.get(entry.exerciseId);
                        return (
                          <span key={entry.exerciseId} className="chip">
                            {ex?.name ?? 'Ejercicio'} · {entry.sets.length}×
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
              <strong className="modal-title" id="clear-title">¿Vaciar el historial?</strong>
              <button className="btn-icon" aria-label="Cerrar" onClick={() => setConfirm(false)}><Icon name="close" size={16} /></button>
            </div>
            <div className="modal-body">
              <p className="small">
                Se ocultarán {sessions.length} sesión(es), {workouts.length} entrenamiento(s) y {prs.length} marca(s) de la interfaz.
                Las rutinas, el plan, las medidas y la biblioteca de ejercicios se conservan.
              </p>
              <div className="notice notice-warn">
                <Icon name="info" size={16} />
                <span>La bóveda es append-only: los eventos antiguos permanecen en el archivo para no romper el registro, pero dejan de mostrarse y de contar en gráficos y alertas.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={clearHistory}><Icon name="trash" size={15} /> Vaciar historial</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
