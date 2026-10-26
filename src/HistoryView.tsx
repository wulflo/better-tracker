import React, { useMemo, useState } from 'react';
import type { Exercise, PR, Routine, Session, VaultEvent, Workout } from './types';
import { appendEvent, newEvent } from './vault';
import {
  formatShort,
  minutesLabel,
  reducePRs,
  reduceRoutines,
  reduceSessions,
  reduceWorkouts,
  visibleTrainingEvents,
} from './metrics';
import { Icon } from './components/Icons';
import { EmptyState } from './components/Fields';

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

  const routines = useMemo(() => reduceRoutines(events), [events]);
  const sessions = useMemo(() => reduceSessions(events), [events]);
  const workouts = useMemo(() => reduceWorkouts(events), [events]);
  const prs = useMemo(() => reducePRs(events), [events]);
  const exerciseMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

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
