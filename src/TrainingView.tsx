import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Exercise,
  Mesocycle,
  Plan,
  PR,
  Routine,
  RoutineExercise,
  SetEntry,
  Session,
  VaultEvent,
  Workout,
} from './types';
import { appendEvent, newEvent } from './vault';
import {
  estimate1RM,
  exerciseSeries,
  formatShort,
  fmtDuration,
  minutesLabel,
  reduceMesocycles,
  reducePlans,
  reducePRs,
  reduceRoutines,
  trainingAlerts,
  trainingSummary,
  visibleTrainingEvents,
  weeklySeries,
  todayISO,
} from './metrics';
import {
  BODY_ZONES,
  TYPE_OPTIONS,
  ZONE_MAP,
  ZONE_OPTIONS,
  zoneForExercise,
  type ZoneId,
} from './zones';
import Select from './components/Select';
import { NumberInput, Field, EmptyState, Stat } from './components/Fields';
import RestTimer, { primeTimerAlarm, timerAlarm } from './components/RestTimer';
import { Icon } from './components/Icons';
import { BarChart, BodyHeatmap, CalendarHeatmap, LineChart, ProgressBar } from './components/Charts';

interface Props {
  deviceId: string;
  events: VaultEvent[];
  exercises: Exercise[];
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

type Tab = 'library' | 'routines' | 'plan' | 'session' | 'calendar' | 'progress';

const TABS: Array<[Tab, string]> = [
  ['library', 'Biblioteca'],
  ['routines', 'Rutinas'],
  ['plan', 'Plan'],
  ['session', 'Sesión'],
  ['calendar', 'Calendario'],
  ['progress', 'Progreso'],
];

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface LiveEntry {
  exerciseId: string;
  sets: SetEntry[];
  rest: number;
}

export default function TrainingView({ deviceId, events, exercises, onRefresh, notify }: Props) {
  const [tab, setTab] = useState<Tab>('library');
  const routines = useMemo(() => reduceRoutines(events), [events]);
  const plans = useMemo(() => reducePlans(events), [events]);
  const mesocycles = useMemo(() => reduceMesocycles(events), [events]);
  const prs = useMemo(() => reducePRs(events), [events]);
  const summary = useMemo(() => trainingSummary(events, exercises), [events, exercises]);
  const alerts = useMemo(() => trainingAlerts(summary), [summary]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Entrenamiento</h1>
          <p className="page-sub">
            Biblioteca, rutinas, planificación, sesión en vivo, calendario y progreso en una sola sección.
          </p>
        </div>
        <div className="page-actions">
          <span className="badge badge-primary"><Icon name="dumbbell" size={12} /> {summary.weekSessions} sesiones · {minutesLabel(summary.weekMinutes)}</span>
          {alerts.length > 0 && <span className="badge badge-warning"><Icon name="alert" size={12} /> {alerts.length} alerta(s)</span>}
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Secciones de entrenamiento">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'library' && (
        <LibraryTab deviceId={deviceId} exercises={exercises} events={events} onRefresh={onRefresh} notify={notify} />
      )}
      {tab === 'routines' && (
        <RoutinesTab deviceId={deviceId} exercises={exercises} routines={routines} onRefresh={onRefresh} notify={notify} />
      )}
      {tab === 'plan' && (
        <PlanTab deviceId={deviceId} routines={routines} plans={plans} mesocycles={mesocycles} onRefresh={onRefresh} notify={notify} />
      )}
      {tab === 'session' && (
        <SessionTab deviceId={deviceId} events={events} exercises={exercises} routines={routines} onRefresh={onRefresh} notify={notify} />
      )}
      {tab === 'calendar' && <CalendarHeatmap events={events} exercises={exercises} prs={prs} />}
      {tab === 'progress' && (
        <ProgressTab events={events} exercises={exercises} summary={summary} alerts={alerts} prs={prs} />
      )}
    </div>
  );
}

function LibraryTab({
  deviceId,
  exercises,
  events,
  onRefresh,
  notify,
}: {
  deviceId: string;
  exercises: Exercise[];
  events: VaultEvent[];
  onRefresh: () => Promise<void>;
  notify: (m: string, t?: 'success' | 'error' | 'info') => void;
}) {
  const [name, setName] = useState('');
  const [zone, setZone] = useState<ZoneId>('chest');
  const [type, setType] = useState('fuerza');
  const [search, setSearch] = useState('');
  const selectedZone = ZONE_MAP[zone];
  const zoneSummary = useMemo(() => trainingSummary(events, exercises), [events, exercises]);

  const save = async () => {
    if (!name.trim()) {
      notify('Escribe el nombre del ejercicio.', 'error');
      return;
    }
    const ex: Exercise = {
      id: crypto.randomUUID(),
      name: name.trim(),
      zone,
      type,
      muscle: selectedZone.muscles.join(', '),
    };
    await appendEvent(newEvent(deviceId, 'exercise.upsert', ex));
    setName('');
    await onRefresh();
    notify('Ejercicio añadido.', 'success');
  };

  const del = async (id: string) => {
    await appendEvent(newEvent(deviceId, 'exercise.delete', { id }));
    await onRefresh();
    notify('Ejercicio eliminado.', 'success');
  };

  const filtered = exercises.filter((ex) => {
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    return ex.name.toLowerCase().includes(t) || zoneForExercise(ex).includes(t) || (ex.muscle ?? '').toLowerCase().includes(t);
  });

  const usage = (id: string) =>
    events.filter((e) => {
      if (e.kind !== 'session.saved' && e.kind !== 'workout.saved') return false;
      return (e.payload.entries ?? []).some((entry: { exerciseId: string }) => entry.exerciseId === id);
    }).length;

  return (
    <div className="grid grid-2">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="plus" /> Añadir ejercicio</div>
            <div className="card-sub">Las zonas son universales: elige una y la app muestra los músculos que incluye.</div>
          </div>
        </div>
        <div className="card-body stack">
          <Field label="Nombre">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Press banca, sentadilla, remo..." />
          </Field>
          <div className="field-row">
            <Field label="Zona corporal">
              <Select value={zone} onChange={(v) => setZone(v as ZoneId)} options={ZONE_OPTIONS} />
            </Field>
            <Field label="Tipo">
              <Select value={type} onChange={setType} options={TYPE_OPTIONS} />
            </Field>
          </div>
          <div className="exercise-zone">
            <span className="field-label">Músculos incluidos</span>
            <div className="exercise-zone-muscles">
              {selectedZone.muscles.map((m) => <span key={m} className="tag">{m}</span>)}
            </div>
            <span className="hint">
              Rango semanal orientativo: {selectedZone.weeklySets[0]}–{selectedZone.weeklySets[1]} series · {selectedZone.weeklyMinutes[0]}–{selectedZone.weeklyMinutes[1]} min.
            </span>
          </div>
          <button className="btn btn-primary" onClick={save}><Icon name="plus" size={15} /> Añadir a la biblioteca</button>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="dumbbell" /> Biblioteca</div>
            <div className="card-sub">{exercises.length} ejercicio(s). Sin campos manuales de zona.</div>
          </div>
          <span className="badge badge-muted">{filtered.length} visibles</span>
        </div>
        <div className="card-body stack">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, zona o músculo..." />
          {filtered.length === 0 ? (
            <EmptyState icon={<Icon name="dumbbell" />} title="Sin ejercicios" sub="Añade el primero para empezar a construir rutinas." />
          ) : (
            <div className="list" style={{ maxHeight: 480, overflow: 'auto', paddingRight: 4 }}>
              {filtered.map((ex) => {
                const z = ZONE_MAP[zoneForExercise(ex)];
                return (
                  <div key={ex.id} className="list-item">
                    <div className="list-item-main">
                      <span className="list-item-title">{ex.name}</span>
                      <span className="list-item-sub">{z.name} · {ex.type} · {usage(ex.id)} uso(s)</span>
                    </div>
                    <div className="list-item-meta">
                      <span className="chip" style={{ borderColor: `${z.color}55` }}>
                        <span className="chip-dot" style={{ background: z.color }} />
                        {z.name}
                      </span>
                      <button className="btn-icon" aria-label={`Eliminar ${ex.name}`} onClick={() => void del(ex.id)}><Icon name="trash" size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="card span-2">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="body" /> Zonas universales</div>
            <div className="card-sub">Cada zona incluye varios músculos y tiene un rango de series/tiempo recomendado para detectar exceso de carga.</div>
          </div>
        </div>
        <div className="card-body">
          <div className="grid grid-3" style={{ gap: 10 }}>
            {BODY_ZONES.map((z) => {
              const load = zoneSummary.zoneLoad[z.id];
              return (
                <div key={z.id} className="metric">
                  <div className="row between">
                    <span className="strong">{z.name}</span>
                    <span className="dot" style={{ width: 9, height: 9, borderRadius: 999, background: z.color, display: 'inline-block' }} />
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>{z.muscles.join(' · ')}</div>
                  <div className="small" style={{ marginTop: 8 }}>
                    {load.sets} series · {Math.round(load.minutes)} min esta semana
                  </div>
                  <div className="hint">Recomendado: {z.weeklySets[0]}–{z.weeklySets[1]} series · {z.weeklyMinutes[0]}–{z.weeklyMinutes[1]} min</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function RoutinesTab({
  deviceId,
  exercises,
  routines,
  onRefresh,
  notify,
}: {
  deviceId: string;
  exercises: Exercise[];
  routines: Routine[];
  onRefresh: () => Promise<void>;
  notify: (m: string, t?: 'success' | 'error' | 'info') => void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [items, setItems] = useState<RoutineExercise[]>([]);

  const exerciseOptions = exercises.map((e) => ({ value: e.id, label: e.name, hint: ZONE_MAP[zoneForExercise(e)].name }));
  const addExercise = () => {
    if (!selected) return;
    setItems((v) => [...v, { exerciseId: selected, sets: 3, reps: 10, load: 0, rest: 90 }]);
    setSelected('');
  };
  const updateItem = (i: number, key: keyof RoutineExercise, value: number) => {
    setItems((v) => v.map((item, idx) => (idx === i ? { ...item, [key]: value } : item)));
  };
  const removeItem = (i: number) => setItems((v) => v.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim() || items.length === 0) {
      notify('La rutina necesita nombre y al menos un ejercicio.', 'error');
      return;
    }
    const r: Routine = { id: crypto.randomUUID(), name: name.trim(), exercises: items };
    await appendEvent(newEvent(deviceId, 'routine.saved', r));
    setName('');
    setItems([]);
    await onRefresh();
    notify('Rutina guardada.', 'success');
  };
  const del = async (id: string) => {
    await appendEvent(newEvent(deviceId, 'routine.deleted', { id }));
    await onRefresh();
    notify('Rutina eliminada.', 'success');
  };

  return (
    <div className="grid grid-2">
      <section className="card span-2">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="plus" /> Nueva rutina</div>
            <div className="card-sub">Define series, repeticiones, carga y descanso. La sesión en vivo reutiliza estos datos.</div>
          </div>
        </div>
        <div className="card-body stack">
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 220 }}>
              <span className="field-label">Nombre de la rutina</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Torso, pierna, full body..." />
            </div>
            <div className="field grow" style={{ minWidth: 200 }}>
              <span className="field-label">Añadir ejercicio</span>
              <Select value={selected} onChange={setSelected} options={exerciseOptions} placeholder="Elegir ejercicio" />
            </div>
            <button className="btn btn-tonal" onClick={addExercise}><Icon name="plus" size={15} /> Añadir</button>
          </div>

          {items.length > 0 && (
            <div className="list">
              {items.map((it, i) => {
                const ex = exercises.find((e) => e.id === it.exerciseId);
                const z = ex ? ZONE_MAP[zoneForExercise(ex)] : null;
                return (
                  <div key={`${it.exerciseId}-${i}`} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <div className="list-item-main">
                      <span className="list-item-title">{ex?.name ?? 'Ejercicio'}</span>
                      <span className="list-item-sub">{z?.name ?? 'Zona'} · {it.sets} series × {it.reps} reps</span>
                    </div>
                    <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
                      <label className="field" style={{ width: 76 }}><span className="field-label">Series</span><NumberInput value={it.sets} onChange={(v) => updateItem(i, 'sets', v)} min={1} max={20} /></label>
                      <label className="field" style={{ width: 76 }}><span className="field-label">Reps</span><NumberInput value={it.reps} onChange={(v) => updateItem(i, 'reps', v)} min={1} max={100} /></label>
                      <label className="field" style={{ width: 84 }}><span className="field-label">Carga kg</span><NumberInput value={it.load} onChange={(v) => updateItem(i, 'load', v)} min={0} max={500} step={0.5} /></label>
                      <label className="field" style={{ width: 90 }}><span className="field-label">Descanso s</span><NumberInput value={it.rest} onChange={(v) => updateItem(i, 'rest', v)} min={0} max={600} /></label>
                      <button className="btn-icon" aria-label="Quitar" onClick={() => removeItem(i)}><Icon name="close" size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="row between">
            <span className="hint">{items.length} ejercicio(s) en la rutina</span>
            <button className="btn btn-primary" onClick={save} disabled={items.length === 0}><Icon name="check" size={15} /> Guardar rutina</button>
          </div>
        </div>
      </section>

      <section className="card span-2">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="dumbbell" /> Rutinas guardadas</div>
            <div className="card-sub">{routines.length} rutina(s). Las rutinas eliminadas desaparecen de sesión y plan.</div>
          </div>
        </div>
        <div className="card-body">
          {routines.length === 0 ? (
            <EmptyState icon={<Icon name="dumbbell" />} title="Sin rutinas" sub="Crea una rutina para reutilizarla en la sesión en vivo y en el plan semanal." />
          ) : (
            <div className="grid grid-2">
              {routines.map((r) => {
                const zones = [...new Set(r.exercises.map((it) => {
                  const ex = exercises.find((e) => e.id === it.exerciseId);
                  return ex ? zoneForExercise(ex) : 'fullbody';
                }))];
                return (
                  <div key={r.id} className="metric">
                    <div className="row between">
                      <span className="strong">{r.name}</span>
                      <button className="btn-icon" aria-label={`Eliminar ${r.name}`} onClick={() => void del(r.id)}><Icon name="trash" size={14} /></button>
                    </div>
                    <div className="chips" style={{ marginTop: 8 }}>
                      {zones.map((z) => (
                        <span key={z} className="chip"><span className="chip-dot" style={{ background: ZONE_MAP[z].color }} />{ZONE_MAP[z].name}</span>
                      ))}
                    </div>
                    <div className="hint" style={{ marginTop: 8 }}>{r.exercises.length} ejercicios · {r.exercises.reduce((a, x) => a + x.sets, 0)} series</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PlanTab({
  deviceId,
  routines,
  plans,
  mesocycles,
  onRefresh,
  notify,
}: {
  deviceId: string;
  routines: Routine[];
  plans: Plan[];
  mesocycles: Mesocycle[];
  onRefresh: () => Promise<void>;
  notify: (m: string, t?: 'success' | 'error' | 'info') => void;
}) {
  const [routineId, setRoutineId] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('18:00');
  const [duration, setDuration] = useState(60);
  const [mesoName, setMesoName] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [deload, setDeload] = useState(true);
  const [start, setStart] = useState(todayISO());

  const routineOptions = routines.map((r) => ({ value: r.id, label: r.name, hint: `${r.exercises.length} ejercicios` }));
  const toggleDay = (d: number) => setDays((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d].sort()));

  const savePlan = async () => {
    if (!routineId || days.length === 0) {
      notify('Elige una rutina y al menos un día.', 'error');
      return;
    }
    const p: Plan = { id: crypto.randomUUID(), routineId, days, startTime, duration };
    await appendEvent(newEvent(deviceId, 'plan.saved', p));
    setDays([]);
    setRoutineId('');
    await onRefresh();
    notify('Plan semanal guardado.', 'success');
  };
  const delPlan = async (id: string) => {
    await appendEvent(newEvent(deviceId, 'plan.deleted', { id }));
    await onRefresh();
  };
  const saveMeso = async () => {
    if (!mesoName.trim()) {
      notify('Escribe un nombre para el mesociclo.', 'error');
      return;
    }
    const m: Mesocycle = { id: crypto.randomUUID(), name: mesoName.trim(), weeks, deload, start };
    await appendEvent(newEvent(deviceId, 'mesocycle.saved', m));
    setMesoName('');
    await onRefresh();
    notify('Mesociclo guardado.', 'success');
  };
  const delMeso = async (id: string) => {
    await appendEvent(newEvent(deviceId, 'mesocycle.deleted', { id }));
    await onRefresh();
  };

  return (
    <div className="grid grid-2">
      <section className="card span-2">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="calendar" /> Plan semanal</div>
            <div className="card-sub">Asigna rutinas a días concretos. El calendario muestra la carga real, no solo el plan.</div>
          </div>
        </div>
        <div className="card-body stack">
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 240 }}>
              <span className="field-label">Rutina</span>
              <Select value={routineId} onChange={setRoutineId} options={routineOptions} placeholder="Elegir rutina" />
            </div>
            <div className="field" style={{ width: 110 }}>
              <span className="field-label">Hora</span>
              <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="field" style={{ width: 110 }}>
              <span className="field-label">Duración min</span>
              <NumberInput value={duration} onChange={setDuration} min={10} max={300} />
            </div>
            <button className="btn btn-tonal" onClick={savePlan}><Icon name="plus" size={15} /> Añadir al plan</button>
          </div>
          <div className="chips">
            {DAY_NAMES.map((d, i) => (
              <button key={d} type="button" className={`chip ${days.includes(i) ? 'active' : ''}`} onClick={() => toggleDay(i)}>{d}</button>
            ))}
          </div>
          <div className="grid grid-4" style={{ gap: 10 }}>
            {DAY_NAMES.map((d, i) => {
              const dayPlans = plans.filter((p) => p.days.includes(i));
              return (
                <div key={d} className="metric">
                  <div className="row between"><span className="strong">{d}</span><span className="badge badge-muted">{dayPlans.length}</span></div>
                  {dayPlans.length === 0 ? <div className="hint" style={{ marginTop: 6 }}>Descanso</div> : (
                    <div className="stack-sm" style={{ marginTop: 8 }}>
                      {dayPlans.map((p) => {
                        const r = routines.find((x) => x.id === p.routineId);
                        return (
                          <div key={p.id} className="small">
                            <div className="row between">
                              <span>{p.startTime} · {r?.name ?? 'Rutina eliminada'}</span>
                              <button className="btn-xs btn-ghost btn" aria-label="Eliminar plan" onClick={() => void delPlan(p.id)}><Icon name="close" size={11} /></button>
                            </div>
                            <span className="muted">{p.duration} min</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card span-2">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="clock" /> Mesociclos</div>
            <div className="card-sub">Bloques de varias semanas con descarga opcional.</div>
          </div>
        </div>
        <div className="card-body stack">
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 220 }}>
              <span className="field-label">Nombre</span>
              <input className="input" value={mesoName} onChange={(e) => setMesoName(e.target.value)} placeholder="Fuerza, hipertrofia, definición..." />
            </div>
            <div className="field" style={{ width: 110 }}>
              <span className="field-label">Semanas</span>
              <NumberInput value={weeks} onChange={setWeeks} min={1} max={52} />
            </div>
            <div className="field" style={{ width: 170 }}>
              <span className="field-label">Inicio</span>
              <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <label className="row small" style={{ paddingBottom: 10 }}>
              <input type="checkbox" checked={deload} onChange={(e) => setDeload(e.target.checked)} /> Semana de descarga
            </label>
            <button className="btn btn-tonal" onClick={saveMeso}><Icon name="plus" size={15} /> Guardar</button>
          </div>
          {mesocycles.length === 0 ? (
            <p className="hint">Sin mesociclos.</p>
          ) : (
            <div className="list">
              {mesocycles.slice().reverse().map((m) => (
                <div key={m.id} className="list-item">
                  <div className="list-item-main">
                    <span className="list-item-title">{m.name}</span>
                    <span className="list-item-sub">{m.weeks} semanas · inicio {m.start} · {m.deload ? 'con descarga' : 'sin descarga'}</span>
                  </div>
                  <button className="btn-icon" aria-label={`Eliminar ${m.name}`} onClick={() => void delMeso(m.id)}><Icon name="trash" size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SessionTab({
  deviceId,
  events,
  exercises,
  routines,
  onRefresh,
  notify,
}: {
  deviceId: string;
  events: VaultEvent[];
  exercises: Exercise[];
  routines: Routine[];
  onRefresh: () => Promise<void>;
  notify: (m: string, t?: 'success' | 'error' | 'info') => void;
}) {
  const [selectedRoutine, setSelectedRoutine] = useState('');
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const [restPaused, setRestPaused] = useState(false);
  const restWasActive = useRef(false);
  const restSuppressAlarm = useRef(false);
  const [addEx, setAddEx] = useState('');
  const restRef = useRef<number | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  useEffect(() => {
    if (restLeft <= 0 || restPaused) return;
    const id = window.setTimeout(() => setRestLeft((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [restLeft, restPaused]);

  useEffect(() => {
    if (restLeft === 0 && restWasActive.current && !restSuppressAlarm.current) {
      timerAlarm();
      notify('Descanso terminado. A por la siguiente serie.', 'success');
    }
    restSuppressAlarm.current = false;
    restWasActive.current = restLeft > 0;
  }, [restLeft, notify]);

  const exerciseOptions = exercises.map((e) => ({
    value: e.id,
    label: e.name,
    hint: ZONE_MAP[zoneForExercise(e)].name,
  }));
  const routineOptions = routines.map((r) => ({ value: r.id, label: r.name, hint: `${r.exercises.length} ejercicios` }));

  const start = () => {
    const r = routines.find((x) => x.id === selectedRoutine);
    if (r) {
      setEntries(
        r.exercises.map((it) => ({
          exerciseId: it.exerciseId,
          rest: it.rest,
          sets: Array.from({ length: Math.max(1, it.sets) }, () => ({ reps: it.reps, weight: it.load, rpe: 7 })),
        })),
      );
    } else {
      setEntries([]);
    }
    setStartedAt(Date.now());
    setElapsed(0);
    primeTimerAlarm();
    stopRest();
  };

  const startRest = (seconds: number) => {
    primeTimerAlarm();
    restSuppressAlarm.current = false;
    restWasActive.current = true;
    setRestPaused(false);
    setRestLeft(Math.max(1, Math.round(seconds)));
  };

  const stopRest = () => {
    restSuppressAlarm.current = true;
    restWasActive.current = false;
    setRestPaused(false);
    setRestLeft(0);
  };

  const addExercise = (id: string) => {
    if (!id) return;
    setEntries((v) => [...v, { exerciseId: id, rest: 90, sets: [{ reps: 10, weight: 0, rpe: 7 }] }]);
    setAddEx('');
  };

  const updateSet = (ei: number, si: number, key: keyof SetEntry, value: number) => {
    setEntries((v) =>
      v.map((entry, idx) =>
        idx === ei
          ? { ...entry, sets: entry.sets.map((s, setIdx) => (setIdx === si ? { ...s, [key]: value } : s)) }
          : entry,
      ),
    );
  };
  const addSet = (ei: number) => {
    setEntries((v) => v.map((entry, idx) => (idx === ei ? { ...entry, sets: [...entry.sets, { reps: entry.sets[entry.sets.length - 1]?.reps || 10, weight: entry.sets[entry.sets.length - 1]?.weight || 0, rpe: 7 }] } : entry)));
  };
  const removeSet = (ei: number, si: number) => {
    setEntries((v) => v.map((entry, idx) => (idx === ei ? { ...entry, sets: entry.sets.filter((_, setIdx) => setIdx !== si) } : entry)));
  };
  const removeEntry = (ei: number) => setEntries((v) => v.filter((_, idx) => idx !== ei));

  const previousBest = useMemo(() => {
    const map = new Map<string, number>();
    const visible = visibleTrainingEvents(events);
    for (const ev of visible) {
      if (ev.kind === 'session.saved') {
        const s = ev.payload as Session;
        for (const entry of s.entries) {
          const best = Math.max(0, ...(entry.sets ?? []).map((x) => x.weight || 0));
          if (best > (map.get(entry.exerciseId) ?? 0)) map.set(entry.exerciseId, best);
        }
      } else if (ev.kind === 'workout.saved') {
        const w = ev.payload as Workout;
        for (const entry of w.entries) {
          const best = Math.max(0, ...(entry.sets ?? []).map((x) => x.weight || 0));
          if (best > (map.get(entry.exerciseId) ?? 0)) map.set(entry.exerciseId, best);
        }
      }
    }
    return map;
  }, [events]);

  const finish = async () => {
    if (startedAt === null) return;
    const cleanEntries = entries
      .map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.filter((s) => s.reps > 0 || s.weight > 0) }))
      .filter((e) => e.sets.length > 0);
    if (cleanEntries.length === 0) {
      notify('La sesión está vacía: añade al menos una serie.', 'error');
      return;
    }
    const session: Session = {
      id: crypto.randomUUID(),
      date: todayISO(),
      routineId: selectedRoutine || null,
      duration: Math.max(1, elapsed),
      entries: cleanEntries,
      rpeSession: 7,
    };
    await appendEvent(newEvent(deviceId, 'session.saved', session));

    const prs: PR[] = [];
    for (const entry of cleanEntries) {
      const best = entry.sets.reduce((a, s) => (s.weight > a.weight ? s : a), entry.sets[0]);
      if (best.weight > 0 && best.weight > (previousBest.get(entry.exerciseId) ?? 0)) {
        const ex = exercises.find((e) => e.id === entry.exerciseId);
        prs.push({
          exerciseId: entry.exerciseId,
          name: ex?.name ?? 'Ejercicio',
          weight: best.weight,
          reps: best.reps,
          date: session.date,
        });
      }
    }
    for (const pr of prs) {
      await appendEvent(newEvent(deviceId, 'pr.achieved', pr));
    }
    setStartedAt(null);
    setEntries([]);
    setElapsed(0);
    stopRest();
    await onRefresh();
    notify(
      prs.length
        ? `Sesión guardada con ${prs.length} marca(s) personal(es): ${prs.map((p) => `${p.name} ${p.weight} kg`).join(', ')}.`
        : 'Sesión guardada.',
      'success',
    );
  };

  const discard = () => {
    setStartedAt(null);
    setEntries([]);
    setElapsed(0);
    stopRest();
  };

  const recent = useMemo(() => {
    return [...summarySessions(events)].slice(-5).reverse();
  }, [events]);

  if (startedAt === null) {
    return (
      <div className="grid grid-2">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="clock" /> Iniciar sesión</div>
              <div className="card-sub">Elige una rutina para precargar series y descansos, o empieza libre.</div>
            </div>
          </div>
          <div className="card-body stack">
            <Field label="Rutina (opcional)">
              <Select value={selectedRoutine} onChange={setSelectedRoutine} options={routineOptions} placeholder="Sesión libre" />
            </Field>
            <button className="btn btn-primary" onClick={start}><Icon name="plus" size={15} /> Iniciar sesión</button>
            <p className="hint">El temporizador y los descansos funcionan mientras la app esté abierta. Al finalizar se detectan marcas personales.</p>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="history" /> Sesiones recientes</div>
              <div className="card-sub">Últimas 5 sesiones guardadas.</div>
            </div>
          </div>
          <div className="card-body">
            {recent.length === 0 ? (
              <EmptyState icon={<Icon name="history" />} title="Sin sesiones" sub="Inicia la primera sesión para ver el historial aquí." />
            ) : (
              <div className="list">
                {recent.map((s) => {
                  const r = routines.find((x) => x.id === s.routineId);
                  const sets = s.entries.reduce((a, e) => a + e.sets.length, 0);
                  return (
                    <div key={s.id} className="list-item">
                      <div className="list-item-main">
                        <span className="list-item-title">{r?.name ?? 'Sesión libre'}</span>
                        <span className="list-item-sub">{formatShort(s.date)} · {Math.round(s.duration / 60)} min · {sets} series</span>
                      </div>
                      <span className="badge badge-muted">{s.entries.length} ej.</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="clock" /> Temporizador de descanso</div>
              <div className="card-sub">Cuenta atrás con aviso sonoro y vibración, sin depender de la sesión en vivo.</div>
            </div>
          </div>
          <div className="card-body">
            <RestTimer notify={notify} />
          </div>
        </section>
      </div>
    );
  }

  const totalSets = entries.reduce((a, e) => a + e.sets.length, 0);

  return (
    <div className="stack">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="clock" /> Sesión en vivo</div>
            <div className="card-sub">{entries.length} ejercicios · {totalSets} series · se guardará con la fecha de hoy.</div>
          </div>
          <div className="row wrap">
            <span className="badge badge-primary">{fmtDuration(elapsed)}</span>
            {restLeft > 0 && (
              <>
                <span className="badge badge-warning">
                  Descanso {fmtDuration(restLeft)}{restPaused ? ' · en pausa' : ''}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setRestPaused((value) => !value)}>
                  <Icon name={restPaused ? 'play' : 'pause'} size={14} /> {restPaused ? 'Reanudar' : 'Pausar'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={stopRest}>
                  <Icon name="close" size={14} /> Quitar descanso
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={discard}><Icon name="close" size={14} /> Descartar</button>
          </div>
        </div>
        <div className="card-body stack">
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field grow" style={{ minWidth: 220 }}>
              <span className="field-label">Añadir ejercicio</span>
              <Select value={addEx} onChange={addExercise} options={exerciseOptions} placeholder="Elegir ejercicio" />
            </div>
            <button className="btn btn-primary" onClick={finish}><Icon name="check" size={15} /> Finalizar y guardar</button>
          </div>

          {entries.length === 0 && (
            <EmptyState icon={<Icon name="dumbbell" />} title="Sesión vacía" sub="Añade ejercicios o empieza con una rutina para precargar el trabajo." />
          )}

          {entries.map((entry, ei) => {
            const ex = exercises.find((e) => e.id === entry.exerciseId);
            const z = ex ? ZONE_MAP[zoneForExercise(ex)] : null;
            return (
              <div key={`${entry.exerciseId}-${ei}`} className="metric" style={{ padding: 14 }}>
                <div className="row between wrap">
                  <div className="row wrap">
                    <strong>{ex?.name ?? 'Ejercicio'}</strong>
                    {z && <span className="chip"><span className="chip-dot" style={{ background: z.color }} />{z.name}</span>}
                  </div>
                  <button className="btn-icon" aria-label="Quitar ejercicio" onClick={() => removeEntry(ei)}><Icon name="trash" size={14} /></button>
                </div>
                <div className="stack-sm" style={{ marginTop: 10 }}>
                  {entry.sets.map((s, si) => (
                    <div key={si} className="row wrap">
                      <span className="hint" style={{ width: 48 }}>Serie {si + 1}</span>
                      <label className="field" style={{ width: 80 }}><span className="field-label">Reps</span><NumberInput value={s.reps} onChange={(v) => updateSet(ei, si, 'reps', v)} min={0} max={200} /></label>
                      <label className="field" style={{ width: 88 }}><span className="field-label">Peso kg</span><NumberInput value={s.weight} onChange={(v) => updateSet(ei, si, 'weight', v)} min={0} max={600} step={0.5} /></label>
                      <label className="field" style={{ width: 76 }}><span className="field-label">RPE</span><NumberInput value={s.rpe ?? 0} onChange={(v) => updateSet(ei, si, 'rpe', v)} min={1} max={10} /></label>
                      <button className="btn btn-ghost btn-sm" onClick={() => startRest(entry.rest || 90)}><Icon name="clock" size={13} /> {entry.rest || 90}s</button>
                      <button className="btn-icon" aria-label="Quitar serie" onClick={() => removeSet(ei, si)}><Icon name="close" size={13} /></button>
                      {s.weight > 0 && s.reps > 0 && (
                        <span className="badge badge-muted">1RM ≈ {Math.round(estimate1RM(s.weight, s.reps).epley ?? 0)} kg</span>
                      )}
                    </div>
                  ))}
                  <div className="row wrap">
                    <button className="btn btn-ghost btn-sm" onClick={() => addSet(ei)}><Icon name="plus" size={13} /> Añadir serie</button>
                    <span className="hint">Descanso sugerido: {entry.rest || 90}s</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function summarySessions(events: VaultEvent[]): Session[] {
  const cutoff = visibleTrainingEvents(events);
  return cutoff
    .filter((e) => e.kind === 'session.saved')
    .map((e) => e.payload as Session)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function ProgressTab({
  events,
  exercises,
  summary,
  alerts,
  prs,
}: {
  events: VaultEvent[];
  exercises: Exercise[];
  summary: ReturnType<typeof trainingSummary>;
  alerts: ReturnType<typeof trainingAlerts>;
  prs: PR[];
}) {
  const [metric, setMetric] = useState<'volume' | 'minutes' | 'sets'>('volume');
  const weekly = useMemo(() => weeklySeries(events, exercises, 8), [events, exercises]);
  const [exerciseId, setExerciseId] = useState('');

  const exerciseOptions = exercises.map((e) => ({ value: e.id, label: e.name, hint: ZONE_MAP[zoneForExercise(e)].name }));
  const defaultExercise = useMemo(() => {
    for (const ex of exercises) {
      if (exerciseSeries(events, ex.id).length > 0) return ex.id;
    }
    return exercises[0]?.id ?? '';
  }, [events, exercises]);
  const selectedExercise = exerciseId || defaultExercise;
  const series = useMemo(() => (selectedExercise ? exerciseSeries(events, selectedExercise) : []), [events, selectedExercise]);
  const selected = exercises.find((e) => e.id === selectedExercise);

  const metricValue = (p: (typeof weekly)[number]) => (metric === 'volume' ? Math.round(p.volume) : metric === 'minutes' ? Math.round(p.minutes) : p.sets);
  const metricSuffix = metric === 'volume' ? ' kg' : metric === 'minutes' ? ' min' : ' series';

  return (
    <div className="stack">
      <div className="grid grid-2">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="chart" /> Carga semanal</div>
              <div className="card-sub">Últimas 8 semanas. Cambia la métrica para ver volumen, minutos o series.</div>
            </div>
            <div className="segmented">
              {(['volume', 'minutes', 'sets'] as const).map((m) => (
                <button key={m} type="button" className={`segment ${metric === m ? 'active' : ''}`} onClick={() => setMetric(m)}>
                  {m === 'volume' ? 'Volumen' : m === 'minutes' ? 'Minutos' : 'Series'}
                </button>
              ))}
            </div>
          </div>
          <div className="card-body">
            <BarChart items={weekly.map((p) => ({ label: p.label, value: metricValue(p), color: 'var(--primary)' }))} suffix={metricSuffix} />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="spark" /> Rendimiento por ejercicio</div>
              <div className="card-sub">Peso máximo por sesión y marcas personales destacadas.</div>
            </div>
            <div style={{ minWidth: 180 }}>
              <Select
                value={selectedExercise}
                onChange={(v) => setExerciseId(v)}
                options={exerciseOptions}
                placeholder="Elegir ejercicio"
              />
            </div>
          </div>
          <div className="card-body">
            {series.length === 0 ? (
              <EmptyState icon={<Icon name="chart" />} title="Sin datos de rendimiento" sub="Registra una sesión con este ejercicio para ver su evolución." />
            ) : (
              <>
                <LineChart
                  points={series.map((p) => ({ label: p.label, value: p.maxWeight, mark: p.pr }))}
                  suffix=" kg"
                  color="var(--tertiary)"
                />
                <div className="row between wrap" style={{ marginTop: 8 }}>
                  <span className="hint">{selected?.name} · {series.length} registro(s)</span>
                  <span className="badge badge-warning"><Icon name="spark" size={12} /> {series.filter((p) => p.pr).length} marca(s)</span>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="body" /> Mapa de calor muscular</div>
              <div className="card-sub">Series y minutos de los últimos 7 días por zona universal.</div>
            </div>
          </div>
          <div className="card-body">
            <BodyHeatmap load={summary.zoneLoad} />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="alert" /> Alertas de carga</div>
              <div className="card-sub">Sobreentrenamiento por zona respecto a series y tiempo recomendados.</div>
            </div>
          </div>
          <div className="card-body stack">
            {alerts.length === 0 ? (
              <div className="notice notice-success">
                <Icon name="check" size={16} />
                <span>Sin señales de sobreentrenamiento. Las zonas están dentro de rangos razonables.</span>
              </div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className={`notice ${a.severity === 'high' ? 'notice-error' : a.severity === 'warn' ? 'notice-warn' : 'notice-info'}`}>
                  <Icon name="alert" size={16} />
                  <div><strong>{a.title}</strong><div className="small">{a.detail}</div></div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="target" /> Carga por zona</div>
            <div className="card-sub">Comparación con el rango semanal recomendado. La última columna indica el estado.</div>
          </div>
        </div>
        <div className="card-body" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Zona</th>
                <th>Series</th>
                <th>Minutos</th>
                <th>Recomendado</th>
                <th>Última sesión</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {BODY_ZONES.map((z) => {
                const load = summary.zoneLoad[z.id];
                const ratio = Math.max(
                  z.weeklySets[1] > 0 ? load.sets / z.weeklySets[1] : 0,
                  load.minutes / z.weeklyMinutes[1],
                );
                const status = ratio > 1.15 ? ['high', 'Exceso'] as const : ratio > 0.85 ? ['warn', 'Cerca del límite'] as const : ['ok', 'Dentro'] as const;
                return (
                  <tr key={z.id}>
                    <td><span className="row"><span className="chip-dot" style={{ background: z.color }} />{z.name}</span></td>
                    <td className="mono">{load.sets}</td>
                    <td className="mono">{Math.round(load.minutes)}</td>
                    <td className="small muted">{z.weeklySets[0]}–{z.weeklySets[1]} series · {z.weeklyMinutes[0]}–{z.weeklyMinutes[1]} min</td>
                    <td className="small">{load.lastDate ? formatShort(load.lastDate) : '—'}</td>
                    <td>
                      <span className={`badge ${status[0] === 'high' ? 'badge-error' : status[0] === 'warn' ? 'badge-warning' : 'badge-success'}`}>{status[1]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="spark" /> Marcas personales</div>
            <div className="card-sub">Detectadas al finalizar una sesión. Se ocultan si vacías el historial.</div>
          </div>
          <span className="badge badge-warning">{prs.length}</span>
        </div>
        <div className="card-body">
          {prs.length === 0 ? (
            <p className="hint">Sin marcas todavía. La app compara el peso máximo por ejercicio con tu historial.</p>
          ) : (
            <div className="list">
              {prs.slice().reverse().slice(0, 20).map((p) => (
                <div key={`${p.date}-${p.exerciseId}-${p.weight}`} className="list-item">
                  <div className="list-item-main">
                    <span className="list-item-title"><Icon name="spark" size={12} /> {p.name}</span>
                    <span className="list-item-sub">{formatShort(p.date)} · {p.weight} kg × {p.reps} reps</span>
                  </div>
                  <span className="badge badge-warning">{Math.round(estimate1RM(p.weight, p.reps).epley ?? p.weight)} kg 1RM</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="chart" /> Progreso por zona</div>
            <div className="card-sub">Series semanales frente al máximo recomendado.</div>
          </div>
        </div>
        <div className="card-body stack" style={{ gap: 12 }}>
          {BODY_ZONES.map((z) => {
            const load = summary.zoneLoad[z.id];
            return (
              <ProgressBar
                key={z.id}
                label={`${z.name} · ${load.sets} series`}
                value={load.sets}
                max={Math.max(1, z.weeklySets[1])}
                valueLabel={`${load.sets}/${z.weeklySets[1]}`}
                color={z.color}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
