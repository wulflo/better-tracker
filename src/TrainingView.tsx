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
  ZONE_MAP,
  exerciseTypeLabel,
  typeOptions,
  zoneForExercise,
  zoneMuscles,
  zoneName,
  zoneNameOf,
  zoneOptions,
  type ZoneId,
} from './zones';
import Select from './components/Select';
import { NumberInput, Field, EmptyState, Stat } from './components/Fields';
import RestTimer, { primeTimerAlarm, timerAlarm } from './components/RestTimer';
import { Icon } from './components/Icons';
import { BarChart, BodyHeatmap, CalendarHeatmap, LineChart, ProgressBar } from './components/Charts';
import { tx, useLanguage } from './i18n';

interface Props {
  deviceId: string;
  events: VaultEvent[];
  exercises: Exercise[];
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

type Tab = 'library' | 'routines' | 'plan' | 'session' | 'calendar' | 'progress';

const TABS: Array<[Tab, string, string]> = [
  ['library', 'Biblioteca', 'Library'],
  ['routines', 'Rutinas', 'Routines'],
  ['plan', 'Plan', 'Plan'],
  ['session', 'Sesión', 'Session'],
  ['calendar', 'Calendario', 'Calendar'],
  ['progress', 'Progreso', 'Progress'],
];

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayNames(lang: 'es' | 'en'): string[] {
  return lang === 'en' ? DAY_NAMES_EN : DAY_NAMES;
}

interface LiveEntry {
  exerciseId: string;
  sets: SetEntry[];
  rest: number;
}

export default function TrainingView({ deviceId, events, exercises, onRefresh, notify }: Props) {
  const { lang } = useLanguage();
  const [tab, setTab] = useState<Tab>('library');
  const routines = useMemo(() => reduceRoutines(events), [events]);
  const plans = useMemo(() => reducePlans(events), [events]);
  const mesocycles = useMemo(() => reduceMesocycles(events), [events]);
  const prs = useMemo(() => reducePRs(events), [events]);
  const summary = useMemo(() => trainingSummary(events, exercises), [events, exercises]);
  const alerts = useMemo(() => trainingAlerts(summary, new Date(), lang), [summary, lang]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{tx(lang, 'Entrenamiento', 'Training')}</h1>
          <p className="page-sub">
            {tx(
              lang,
              'Biblioteca, rutinas, planificación, sesión en vivo, calendario y progreso en una sola sección.',
              'Library, routines, planning, live session, calendar and progress in a single section.',
            )}
          </p>
        </div>
        <div className="page-actions">
          <span className="badge badge-primary">
            <Icon name="dumbbell" size={12} />{' '}
            {tx(
              lang,
              `${summary.weekSessions} ${summary.weekSessions === 1 ? 'sesión' : 'sesiones'} · ${minutesLabel(summary.weekMinutes)}`,
              `${summary.weekSessions} ${summary.weekSessions === 1 ? 'session' : 'sessions'} · ${minutesLabel(summary.weekMinutes)}`,
            )}
          </span>
          {alerts.length > 0 && (
            <span className="badge badge-warning">
              <Icon name="alert" size={12} />{' '}
              {tx(
                lang,
                `${alerts.length} alerta(s)`,
                `${alerts.length} ${alerts.length === 1 ? 'alert' : 'alerts'}`,
              )}
            </span>
          )}
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label={tx(lang, 'Secciones de entrenamiento', 'Training sections')}>
        {TABS.map(([id, es, en]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {tx(lang, es, en)}
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
  const { lang } = useLanguage();
  const [name, setName] = useState('');
  const [zone, setZone] = useState<ZoneId>('chest');
  const [type, setType] = useState('fuerza');
  const [search, setSearch] = useState('');
  const selectedZone = ZONE_MAP[zone];
  const zoneSummary = useMemo(() => trainingSummary(events, exercises), [events, exercises]);

  const save = async () => {
    if (!name.trim()) {
      notify(tx(lang, 'Escribe el nombre del ejercicio.', 'Enter the exercise name.'), 'error');
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
    notify(tx(lang, 'Ejercicio añadido.', 'Exercise added.'), 'success');
  };

  const del = async (id: string) => {
    await appendEvent(newEvent(deviceId, 'exercise.delete', { id }));
    await onRefresh();
    notify(tx(lang, 'Ejercicio eliminado.', 'Exercise deleted.'), 'success');
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
            <div className="card-title"><Icon name="plus" /> {tx(lang, 'Añadir ejercicio', 'Add exercise')}</div>
            <div className="card-sub">
              {tx(
                lang,
                'Las zonas son universales: elige una y la app muestra los músculos que incluye.',
                'Zones are universal: pick one and the app shows the muscles it includes.',
              )}
            </div>
          </div>
        </div>
        <div className="card-body stack">
          <Field label={tx(lang, 'Nombre', 'Name')}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tx(lang, 'Press banca, sentadilla, remo...', 'Bench press, squat, row...')} />
          </Field>
          <div className="field-row">
            <Field label={tx(lang, 'Zona corporal', 'Body zone')}>
              <Select value={zone} onChange={(v) => setZone(v as ZoneId)} options={zoneOptions(lang)} />
            </Field>
            <Field label={tx(lang, 'Tipo', 'Type')}>
              <Select value={type} onChange={setType} options={typeOptions(lang)} />
            </Field>
          </div>
          <div className="exercise-zone">
            <span className="field-label">{tx(lang, 'Músculos incluidos', 'Included muscles')}</span>
            <div className="exercise-zone-muscles">
              {zoneMuscles(selectedZone, lang).map((m) => <span key={m} className="tag">{m}</span>)}
            </div>
            <span className="hint">
              {tx(
                lang,
                `Rango semanal orientativo: ${selectedZone.weeklySets[0]}–${selectedZone.weeklySets[1]} series · ${selectedZone.weeklyMinutes[0]}–${selectedZone.weeklyMinutes[1]} min.`,
                `Suggested weekly range: ${selectedZone.weeklySets[0]}–${selectedZone.weeklySets[1]} sets · ${selectedZone.weeklyMinutes[0]}–${selectedZone.weeklyMinutes[1]} min.`,
              )}
            </span>
          </div>
          <button className="btn btn-primary" onClick={save}><Icon name="plus" size={15} /> {tx(lang, 'Añadir a la biblioteca', 'Add to library')}</button>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="dumbbell" /> {tx(lang, 'Biblioteca', 'Library')}</div>
            <div className="card-sub">
              {tx(
                lang,
                `${exercises.length} ejercicio(s). Sin campos manuales de zona.`,
                `${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'}. No manual zone fields.`,
              )}
            </div>
          </div>
          <span className="badge badge-muted">
            {tx(lang, `${filtered.length} visibles`, `${filtered.length} visible`)}
          </span>
        </div>
        <div className="card-body stack">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tx(lang, 'Buscar por nombre, zona o músculo...', 'Search by name, zone or muscle...')} />
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Icon name="dumbbell" />}
              title={tx(lang, 'Sin ejercicios', 'No exercises')}
              sub={tx(lang, 'Añade el primero para empezar a construir rutinas.', 'Add the first one to start building routines.')}
            />
          ) : (
            <div className="list" style={{ maxHeight: 480, overflow: 'auto', paddingRight: 4 }}>
              {filtered.map((ex) => {
                const z = ZONE_MAP[zoneForExercise(ex)];
                const uses = usage(ex.id);
                return (
                  <div key={ex.id} className="list-item">
                    <div className="list-item-main">
                      <span className="list-item-title">{ex.name}</span>
                      <span className="list-item-sub">
                        {zoneNameOf(z, lang)} · {exerciseTypeLabel(ex.type, lang)} ·{' '}
                        {tx(lang, `${uses} uso(s)`, `${uses} ${uses === 1 ? 'use' : 'uses'}`)}
                      </span>
                    </div>
                    <div className="list-item-meta">
                      <span className="chip" style={{ borderColor: `${z.color}55` }}>
                        <span className="chip-dot" style={{ background: z.color }} />
                        {zoneNameOf(z, lang)}
                      </span>
                      <button className="btn-icon" aria-label={tx(lang, `Eliminar ${ex.name}`, `Delete ${ex.name}`)} onClick={() => void del(ex.id)}><Icon name="trash" size={14} /></button>
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
            <div className="card-title"><Icon name="body" /> {tx(lang, 'Zonas universales', 'Universal zones')}</div>
            <div className="card-sub">
              {tx(
                lang,
                'Cada zona incluye varios músculos y tiene un rango de series/tiempo recomendado para detectar exceso de carga.',
                'Each zone includes several muscles and has a recommended sets/time range to detect overload.',
              )}
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="grid grid-3" style={{ gap: 10 }}>
            {BODY_ZONES.map((z) => {
              const load = zoneSummary.zoneLoad[z.id];
              return (
                <div key={z.id} className="metric">
                  <div className="row between">
                    <span className="strong">{zoneNameOf(z, lang)}</span>
                    <span className="dot" style={{ width: 9, height: 9, borderRadius: 999, background: z.color, display: 'inline-block' }} />
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>{zoneMuscles(z, lang).join(' · ')}</div>
                  <div className="small" style={{ marginTop: 8 }}>
                    {tx(
                      lang,
                      `${load.sets} series · ${Math.round(load.minutes)} min esta semana`,
                      `${load.sets} sets · ${Math.round(load.minutes)} min this week`,
                    )}
                  </div>
                  <div className="hint">
                    {tx(
                      lang,
                      `Recomendado: ${z.weeklySets[0]}–${z.weeklySets[1]} series · ${z.weeklyMinutes[0]}–${z.weeklyMinutes[1]} min`,
                      `Recommended: ${z.weeklySets[0]}–${z.weeklySets[1]} sets · ${z.weeklyMinutes[0]}–${z.weeklyMinutes[1]} min`,
                    )}
                  </div>
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
  const { lang } = useLanguage();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [items, setItems] = useState<RoutineExercise[]>([]);

  const exerciseOptions = exercises.map((e) => ({ value: e.id, label: e.name, hint: zoneName(zoneForExercise(e), lang) }));
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
      notify(tx(lang, 'La rutina necesita nombre y al menos un ejercicio.', 'The routine needs a name and at least one exercise.'), 'error');
      return;
    }
    const r: Routine = { id: crypto.randomUUID(), name: name.trim(), exercises: items };
    await appendEvent(newEvent(deviceId, 'routine.saved', r));
    setName('');
    setItems([]);
    await onRefresh();
    notify(tx(lang, 'Rutina guardada.', 'Routine saved.'), 'success');
  };
  const del = async (id: string) => {
    await appendEvent(newEvent(deviceId, 'routine.deleted', { id }));
    await onRefresh();
    notify(tx(lang, 'Rutina eliminada.', 'Routine deleted.'), 'success');
  };

  return (
    <div className="grid grid-2">
      <section className="card span-2">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="plus" /> {tx(lang, 'Nueva rutina', 'New routine')}</div>
            <div className="card-sub">
              {tx(
                lang,
                'Define series, repeticiones, carga y descanso. La sesión en vivo reutiliza estos datos.',
                'Define sets, reps, load and rest. The live session reuses this data.',
              )}
            </div>
          </div>
        </div>
        <div className="card-body stack">
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 220 }}>
              <span className="field-label">{tx(lang, 'Nombre de la rutina', 'Routine name')}</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tx(lang, 'Torso, pierna, full body...', 'Upper body, legs, full body...')} />
            </div>
            <div className="field grow" style={{ minWidth: 200 }}>
              <span className="field-label">{tx(lang, 'Añadir ejercicio', 'Add exercise')}</span>
              <Select value={selected} onChange={setSelected} options={exerciseOptions} placeholder={tx(lang, 'Elegir ejercicio', 'Choose exercise')} />
            </div>
            <button className="btn btn-tonal" onClick={addExercise}><Icon name="plus" size={15} /> {tx(lang, 'Añadir', 'Add')}</button>
          </div>

          {items.length > 0 && (
            <div className="list">
              {items.map((it, i) => {
                const ex = exercises.find((e) => e.id === it.exerciseId);
                const z = ex ? ZONE_MAP[zoneForExercise(ex)] : null;
                return (
                  <div key={`${it.exerciseId}-${i}`} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <div className="list-item-main">
                      <span className="list-item-title">{ex?.name ?? tx(lang, 'Ejercicio', 'Exercise')}</span>
                      <span className="list-item-sub">
                        {z ? zoneNameOf(z, lang) : tx(lang, 'Zona', 'Zone')} · {it.sets} {tx(lang, 'series', 'sets')} × {it.reps} reps
                      </span>
                    </div>
                    <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
                      <label className="field" style={{ width: 76 }}><span className="field-label">{tx(lang, 'Series', 'Sets')}</span><NumberInput value={it.sets} onChange={(v) => updateItem(i, 'sets', v)} min={1} max={20} /></label>
                      <label className="field" style={{ width: 76 }}><span className="field-label">Reps</span><NumberInput value={it.reps} onChange={(v) => updateItem(i, 'reps', v)} min={1} max={100} /></label>
                      <label className="field" style={{ width: 84 }}><span className="field-label">{tx(lang, 'Carga kg', 'Load kg')}</span><NumberInput value={it.load} onChange={(v) => updateItem(i, 'load', v)} min={0} max={500} step={0.5} /></label>
                      <label className="field" style={{ width: 90 }}><span className="field-label">{tx(lang, 'Descanso s', 'Rest s')}</span><NumberInput value={it.rest} onChange={(v) => updateItem(i, 'rest', v)} min={0} max={600} /></label>
                      <button className="btn-icon" aria-label={tx(lang, 'Quitar', 'Remove')} onClick={() => removeItem(i)}><Icon name="close" size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="row between">
            <span className="hint">
              {tx(lang, `${items.length} ejercicio(s) en la rutina`, `${items.length} ${items.length === 1 ? 'exercise' : 'exercises'} in the routine`)}
            </span>
            <button className="btn btn-primary" onClick={save} disabled={items.length === 0}><Icon name="check" size={15} /> {tx(lang, 'Guardar rutina', 'Save routine')}</button>
          </div>
        </div>
      </section>

      <section className="card span-2">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="dumbbell" /> {tx(lang, 'Rutinas guardadas', 'Saved routines')}</div>
            <div className="card-sub">
              {tx(
                lang,
                `${routines.length} rutina(s). Las rutinas eliminadas desaparecen de sesión y plan.`,
                `${routines.length} ${routines.length === 1 ? 'routine' : 'routines'}. Deleted routines disappear from session and plan.`,
              )}
            </div>
          </div>
        </div>
        <div className="card-body">
          {routines.length === 0 ? (
            <EmptyState
              icon={<Icon name="dumbbell" />}
              title={tx(lang, 'Sin rutinas', 'No routines')}
              sub={tx(lang, 'Crea una rutina para reutilizarla en la sesión en vivo y en el plan semanal.', 'Create a routine to reuse it in the live session and the weekly plan.')}
            />
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
                      <button className="btn-icon" aria-label={tx(lang, `Eliminar ${r.name}`, `Delete ${r.name}`)} onClick={() => void del(r.id)}><Icon name="trash" size={14} /></button>
                    </div>
                    <div className="chips" style={{ marginTop: 8 }}>
                      {zones.map((z) => (
                        <span key={z} className="chip"><span className="chip-dot" style={{ background: ZONE_MAP[z].color }} />{zoneName(z, lang)}</span>
                      ))}
                    </div>
                    <div className="hint" style={{ marginTop: 8 }}>
                      {tx(
                        lang,
                        `${r.exercises.length} ejercicios · ${r.exercises.reduce((a, x) => a + x.sets, 0)} series`,
                        `${r.exercises.length} ${r.exercises.length === 1 ? 'exercise' : 'exercises'} · ${r.exercises.reduce((a, x) => a + x.sets, 0)} sets`,
                      )}
                    </div>
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
  const { lang } = useLanguage();
  const [routineId, setRoutineId] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('18:00');
  const [duration, setDuration] = useState(60);
  const [mesoName, setMesoName] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [deload, setDeload] = useState(true);
  const [start, setStart] = useState(todayISO());

  const routineOptions = routines.map((r) => ({ value: r.id, label: r.name, hint: tx(lang, `${r.exercises.length} ejercicios`, `${r.exercises.length} ${r.exercises.length === 1 ? 'exercise' : 'exercises'}`) }));
  const toggleDay = (d: number) => setDays((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d].sort()));

  const savePlan = async () => {
    if (!routineId || days.length === 0) {
      notify(tx(lang, 'Elige una rutina y al menos un día.', 'Choose a routine and at least one day.'), 'error');
      return;
    }
    const p: Plan = { id: crypto.randomUUID(), routineId, days, startTime, duration };
    await appendEvent(newEvent(deviceId, 'plan.saved', p));
    setDays([]);
    setRoutineId('');
    await onRefresh();
    notify(tx(lang, 'Plan semanal guardado.', 'Weekly plan saved.'), 'success');
  };
  const delPlan = async (id: string) => {
    await appendEvent(newEvent(deviceId, 'plan.deleted', { id }));
    await onRefresh();
  };
  const saveMeso = async () => {
    if (!mesoName.trim()) {
      notify(tx(lang, 'Escribe un nombre para el mesociclo.', 'Enter a name for the mesocycle.'), 'error');
      return;
    }
    const m: Mesocycle = { id: crypto.randomUUID(), name: mesoName.trim(), weeks, deload, start };
    await appendEvent(newEvent(deviceId, 'mesocycle.saved', m));
    setMesoName('');
    await onRefresh();
    notify(tx(lang, 'Mesociclo guardado.', 'Mesocycle saved.'), 'success');
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
            <div className="card-title"><Icon name="calendar" /> {tx(lang, 'Plan semanal', 'Weekly plan')}</div>
            <div className="card-sub">
              {tx(
                lang,
                'Asigna rutinas a días concretos. El calendario muestra la carga real, no solo el plan.',
                'Assign routines to specific days. The calendar shows actual load, not just the plan.',
              )}
            </div>
          </div>
        </div>
        <div className="card-body stack">
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 240 }}>
              <span className="field-label">{tx(lang, 'Rutina', 'Routine')}</span>
              <Select value={routineId} onChange={setRoutineId} options={routineOptions} placeholder={tx(lang, 'Elegir rutina', 'Choose routine')} />
            </div>
            <div className="field" style={{ width: 110 }}>
              <span className="field-label">{tx(lang, 'Hora', 'Time')}</span>
              <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="field" style={{ width: 110 }}>
              <span className="field-label">{tx(lang, 'Duración min', 'Duration min')}</span>
              <NumberInput value={duration} onChange={setDuration} min={10} max={300} />
            </div>
            <button className="btn btn-tonal" onClick={savePlan}><Icon name="plus" size={15} /> {tx(lang, 'Añadir al plan', 'Add to plan')}</button>
          </div>
          <div className="chips">
            {dayNames(lang).map((d, i) => (
              <button key={d} type="button" className={`chip ${days.includes(i) ? 'active' : ''}`} onClick={() => toggleDay(i)}>{d}</button>
            ))}
          </div>
          <div className="grid grid-4" style={{ gap: 10 }}>
            {dayNames(lang).map((d, i) => {
              const dayPlans = plans.filter((p) => p.days.includes(i));
              return (
                <div key={d} className="metric">
                  <div className="row between"><span className="strong">{d}</span><span className="badge badge-muted">{dayPlans.length}</span></div>
                  {dayPlans.length === 0 ? <div className="hint" style={{ marginTop: 6 }}>{tx(lang, 'Descanso', 'Rest')}</div> : (
                    <div className="stack-sm" style={{ marginTop: 8 }}>
                      {dayPlans.map((p) => {
                        const r = routines.find((x) => x.id === p.routineId);
                        return (
                          <div key={p.id} className="small">
                            <div className="row between">
                              <span>{p.startTime} · {r?.name ?? tx(lang, 'Rutina eliminada', 'Deleted routine')}</span>
                              <button className="btn-xs btn-ghost btn" aria-label={tx(lang, 'Eliminar plan', 'Delete plan')} onClick={() => void delPlan(p.id)}><Icon name="close" size={11} /></button>
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
            <div className="card-title"><Icon name="clock" /> {tx(lang, 'Mesociclos', 'Mesocycles')}</div>
            <div className="card-sub">{tx(lang, 'Bloques de varias semanas con descarga opcional.', 'Multi-week blocks with optional deload.')}</div>
          </div>
        </div>
        <div className="card-body stack">
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 220 }}>
              <span className="field-label">{tx(lang, 'Nombre', 'Name')}</span>
              <input className="input" value={mesoName} onChange={(e) => setMesoName(e.target.value)} placeholder={tx(lang, 'Fuerza, hipertrofia, definición...', 'Strength, hypertrophy, definition...')} />
            </div>
            <div className="field" style={{ width: 110 }}>
              <span className="field-label">{tx(lang, 'Semanas', 'Weeks')}</span>
              <NumberInput value={weeks} onChange={setWeeks} min={1} max={52} />
            </div>
            <div className="field" style={{ width: 170 }}>
              <span className="field-label">{tx(lang, 'Inicio', 'Start')}</span>
              <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <label className="row small" style={{ paddingBottom: 10 }}>
              <input type="checkbox" checked={deload} onChange={(e) => setDeload(e.target.checked)} /> {tx(lang, 'Semana de descarga', 'Deload week')}
            </label>
            <button className="btn btn-tonal" onClick={saveMeso}><Icon name="plus" size={15} /> {tx(lang, 'Guardar', 'Save')}</button>
          </div>
          {mesocycles.length === 0 ? (
            <p className="hint">{tx(lang, 'Sin mesociclos.', 'No mesocycles.')}</p>
          ) : (
            <div className="list">
              {mesocycles.slice().reverse().map((m) => (
                <div key={m.id} className="list-item">
                  <div className="list-item-main">
                    <span className="list-item-title">{m.name}</span>
                    <span className="list-item-sub">
                      {tx(
                        lang,
                        `${m.weeks} semanas · inicio ${m.start} · ${m.deload ? 'con descarga' : 'sin descarga'}`,
                        `${m.weeks} ${m.weeks === 1 ? 'week' : 'weeks'} · starts ${m.start} · ${m.deload ? 'with deload' : 'without deload'}`,
                      )}
                    </span>
                  </div>
                  <button className="btn-icon" aria-label={tx(lang, `Eliminar ${m.name}`, `Delete ${m.name}`)} onClick={() => void delMeso(m.id)}><Icon name="trash" size={14} /></button>
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
  const { lang } = useLanguage();
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
      notify(tx(lang, 'Descanso terminado. A por la siguiente serie.', 'Rest finished. On to the next set.'), 'success');
    }
    restSuppressAlarm.current = false;
    restWasActive.current = restLeft > 0;
  }, [restLeft, notify, lang]);

  const exerciseOptions = exercises.map((e) => ({
    value: e.id,
    label: e.name,
    hint: zoneName(zoneForExercise(e), lang),
  }));
  const routineOptions = routines.map((r) => ({ value: r.id, label: r.name, hint: tx(lang, `${r.exercises.length} ejercicios`, `${r.exercises.length} ${r.exercises.length === 1 ? 'exercise' : 'exercises'}`) }));

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
      notify(tx(lang, 'La sesión está vacía: añade al menos una serie.', 'The session is empty: add at least one set.'), 'error');
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
          name: ex?.name ?? tx(lang, 'Ejercicio', 'Exercise'),
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
        ? tx(
            lang,
            `Sesión guardada con ${prs.length} marca(s) personal(es): ${prs.map((p) => `${p.name} ${p.weight} kg`).join(', ')}.`,
            `Session saved with ${prs.length} personal ${prs.length === 1 ? 'record' : 'records'}: ${prs.map((p) => `${p.name} ${p.weight} kg`).join(', ')}.`,
          )
        : tx(lang, 'Sesión guardada.', 'Session saved.'),
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
              <div className="card-title"><Icon name="clock" /> {tx(lang, 'Iniciar sesión', 'Start session')}</div>
              <div className="card-sub">
                {tx(lang, 'Elige una rutina para precargar series y descansos, o empieza libre.', 'Choose a routine to preload sets and rests, or start free.')}
              </div>
            </div>
          </div>
          <div className="card-body stack">
            <Field label={tx(lang, 'Rutina (opcional)', 'Routine (optional)')}>
              <Select value={selectedRoutine} onChange={setSelectedRoutine} options={routineOptions} placeholder={tx(lang, 'Sesión libre', 'Free session')} />
            </Field>
            <button className="btn btn-primary" onClick={start}><Icon name="plus" size={15} /> {tx(lang, 'Iniciar sesión', 'Start session')}</button>
            <p className="hint">
              {tx(
                lang,
                'El temporizador y los descansos funcionan mientras la app esté abierta. Al finalizar se detectan marcas personales.',
                'The timer and rests work while the app is open. Personal records are detected when you finish.',
              )}
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="history" /> {tx(lang, 'Sesiones recientes', 'Recent sessions')}</div>
              <div className="card-sub">{tx(lang, 'Últimas 5 sesiones guardadas.', 'Last 5 saved sessions.')}</div>
            </div>
          </div>
          <div className="card-body">
            {recent.length === 0 ? (
              <EmptyState
                icon={<Icon name="history" />}
                title={tx(lang, 'Sin sesiones', 'No sessions')}
                sub={tx(lang, 'Inicia la primera sesión para ver el historial aquí.', 'Start your first session to see the history here.')}
              />
            ) : (
              <div className="list">
                {recent.map((s) => {
                  const r = routines.find((x) => x.id === s.routineId);
                  const sets = s.entries.reduce((a, e) => a + e.sets.length, 0);
                  return (
                    <div key={s.id} className="list-item">
                      <div className="list-item-main">
                        <span className="list-item-title">{r?.name ?? tx(lang, 'Sesión libre', 'Free session')}</span>
                        <span className="list-item-sub">
                          {formatShort(s.date, lang)} · {Math.round(s.duration / 60)} min ·{' '}
                          {tx(lang, `${sets} series`, `${sets} ${sets === 1 ? 'set' : 'sets'}`)}
                        </span>
                      </div>
                      <span className="badge badge-muted">
                        {tx(lang, `${s.entries.length} ej.`, `${s.entries.length} ex.`)}
                      </span>
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
              <div className="card-title"><Icon name="clock" /> {tx(lang, 'Temporizador de descanso', 'Rest timer')}</div>
              <div className="card-sub">
                {tx(
                  lang,
                  'Cuenta atrás con aviso sonoro y vibración, sin depender de la sesión en vivo.',
                  'Countdown with sound and vibration, independent of the live session.',
                )}
              </div>
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
            <div className="card-title"><Icon name="clock" /> {tx(lang, 'Sesión en vivo', 'Live session')}</div>
            <div className="card-sub">
              {tx(
                lang,
                `${entries.length} ejercicios · ${totalSets} series · se guardará con la fecha de hoy.`,
                `${entries.length} ${entries.length === 1 ? 'exercise' : 'exercises'} · ${totalSets} ${totalSets === 1 ? 'set' : 'sets'} · will be saved with today's date.`,
              )}
            </div>
          </div>
          <div className="row wrap">
            <span className="badge badge-primary">{fmtDuration(elapsed)}</span>
            {restLeft > 0 && (
              <>
                <span className="badge badge-warning">
                  {tx(
                    lang,
                    `Descanso ${fmtDuration(restLeft)}${restPaused ? ' · en pausa' : ''}`,
                    `Rest ${fmtDuration(restLeft)}${restPaused ? ' · paused' : ''}`,
                  )}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setRestPaused((value) => !value)}>
                  <Icon name={restPaused ? 'play' : 'pause'} size={14} /> {tx(lang, restPaused ? 'Reanudar' : 'Pausar', restPaused ? 'Resume' : 'Pause')}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={stopRest}>
                  <Icon name="close" size={14} /> {tx(lang, 'Quitar descanso', 'Stop rest')}
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={discard}><Icon name="close" size={14} /> {tx(lang, 'Descartar', 'Discard')}</button>
          </div>
        </div>
        <div className="card-body stack">
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field grow" style={{ minWidth: 220 }}>
              <span className="field-label">{tx(lang, 'Añadir ejercicio', 'Add exercise')}</span>
              <Select value={addEx} onChange={addExercise} options={exerciseOptions} placeholder={tx(lang, 'Elegir ejercicio', 'Choose exercise')} />
            </div>
            <button className="btn btn-primary" onClick={finish}><Icon name="check" size={15} /> {tx(lang, 'Finalizar y guardar', 'Finish and save')}</button>
          </div>

          {entries.length === 0 && (
            <EmptyState
              icon={<Icon name="dumbbell" />}
              title={tx(lang, 'Sesión vacía', 'Empty session')}
              sub={tx(lang, 'Añade ejercicios o empieza con una rutina para precargar el trabajo.', 'Add exercises or start with a routine to preload the work.')}
            />
          )}

          {entries.map((entry, ei) => {
            const ex = exercises.find((e) => e.id === entry.exerciseId);
            const z = ex ? ZONE_MAP[zoneForExercise(ex)] : null;
            return (
              <div key={`${entry.exerciseId}-${ei}`} className="metric" style={{ padding: 14 }}>
                <div className="row between wrap">
                  <div className="row wrap">
                    <strong>{ex?.name ?? tx(lang, 'Ejercicio', 'Exercise')}</strong>
                    {z && <span className="chip"><span className="chip-dot" style={{ background: z.color }} />{zoneNameOf(z, lang)}</span>}
                  </div>
                  <button className="btn-icon" aria-label={tx(lang, 'Quitar ejercicio', 'Remove exercise')} onClick={() => removeEntry(ei)}><Icon name="trash" size={14} /></button>
                </div>
                <div className="stack-sm" style={{ marginTop: 10 }}>
                  {entry.sets.map((s, si) => (
                    <div key={si} className="row wrap">
                      <span className="hint" style={{ width: 48 }}>{tx(lang, `Serie ${si + 1}`, `Set ${si + 1}`)}</span>
                      <label className="field" style={{ width: 80 }}><span className="field-label">Reps</span><NumberInput value={s.reps} onChange={(v) => updateSet(ei, si, 'reps', v)} min={0} max={200} /></label>
                      <label className="field" style={{ width: 88 }}><span className="field-label">{tx(lang, 'Peso kg', 'Weight kg')}</span><NumberInput value={s.weight} onChange={(v) => updateSet(ei, si, 'weight', v)} min={0} max={600} step={0.5} /></label>
                      <label className="field" style={{ width: 76 }}><span className="field-label">RPE</span><NumberInput value={s.rpe ?? 0} onChange={(v) => updateSet(ei, si, 'rpe', v)} min={1} max={10} /></label>
                      <button className="btn btn-ghost btn-sm" onClick={() => startRest(entry.rest || 90)}><Icon name="clock" size={13} /> {entry.rest || 90}s</button>
                      <button className="btn-icon" aria-label={tx(lang, 'Quitar serie', 'Remove set')} onClick={() => removeSet(ei, si)}><Icon name="close" size={13} /></button>
                      {s.weight > 0 && s.reps > 0 && (
                        <span className="badge badge-muted">1RM ≈ {Math.round(estimate1RM(s.weight, s.reps).epley ?? 0)} kg</span>
                      )}
                    </div>
                  ))}
                  <div className="row wrap">
                    <button className="btn btn-ghost btn-sm" onClick={() => addSet(ei)}><Icon name="plus" size={13} /> {tx(lang, 'Añadir serie', 'Add set')}</button>
                    <span className="hint">
                      {tx(lang, `Descanso sugerido: ${entry.rest || 90}s`, `Suggested rest: ${entry.rest || 90}s`)}
                    </span>
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
  const { lang } = useLanguage();
  const [metric, setMetric] = useState<'volume' | 'minutes' | 'sets'>('volume');
  const weekly = useMemo(() => weeklySeries(events, exercises, 8, new Date(), lang), [events, exercises, lang]);
  const [exerciseId, setExerciseId] = useState('');

  const exerciseOptions = exercises.map((e) => ({ value: e.id, label: e.name, hint: zoneName(zoneForExercise(e), lang) }));
  const defaultExercise = useMemo(() => {
    for (const ex of exercises) {
      if (exerciseSeries(events, ex.id, lang).length > 0) return ex.id;
    }
    return exercises[0]?.id ?? '';
  }, [events, exercises, lang]);
  const selectedExercise = exerciseId || defaultExercise;
  const series = useMemo(() => (selectedExercise ? exerciseSeries(events, selectedExercise, lang) : []), [events, selectedExercise, lang]);
  const selected = exercises.find((e) => e.id === selectedExercise);

  const metricValue = (p: (typeof weekly)[number]) => (metric === 'volume' ? Math.round(p.volume) : metric === 'minutes' ? Math.round(p.minutes) : p.sets);
  const metricSuffix = metric === 'volume' ? ' kg' : metric === 'minutes' ? ' min' : tx(lang, ' series', ' sets');

  return (
    <div className="stack">
      <div className="grid grid-2">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="chart" /> {tx(lang, 'Carga semanal', 'Weekly load')}</div>
              <div className="card-sub">
                {tx(
                  lang,
                  'Últimas 8 semanas. Cambia la métrica para ver volumen, minutos o series.',
                  'Last 8 weeks. Change the metric to see volume, minutes or sets.',
                )}
              </div>
            </div>
            <div className="segmented">
              {(['volume', 'minutes', 'sets'] as const).map((m) => (
                <button key={m} type="button" className={`segment ${metric === m ? 'active' : ''}`} onClick={() => setMetric(m)}>
                  {m === 'volume' ? tx(lang, 'Volumen', 'Volume') : m === 'minutes' ? tx(lang, 'Minutos', 'Minutes') : tx(lang, 'Series', 'Sets')}
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
              <div className="card-title"><Icon name="spark" /> {tx(lang, 'Rendimiento por ejercicio', 'Performance by exercise')}</div>
              <div className="card-sub">
                {tx(lang, 'Peso máximo por sesión y marcas personales destacadas.', 'Max weight per session and highlighted personal records.')}
              </div>
            </div>
            <div style={{ minWidth: 180 }}>
              <Select
                value={selectedExercise}
                onChange={(v) => setExerciseId(v)}
                options={exerciseOptions}
                placeholder={tx(lang, 'Elegir ejercicio', 'Choose exercise')}
              />
            </div>
          </div>
          <div className="card-body">
            {series.length === 0 ? (
              <EmptyState
                icon={<Icon name="chart" />}
                title={tx(lang, 'Sin datos de rendimiento', 'No performance data')}
                sub={tx(lang, 'Registra una sesión con este ejercicio para ver su evolución.', 'Log a session with this exercise to see its evolution.')}
              />
            ) : (
              <>
                <LineChart
                  points={series.map((p) => ({ label: p.label, value: p.maxWeight, mark: p.pr }))}
                  suffix=" kg"
                  color="var(--tertiary)"
                />
                <div className="row between wrap" style={{ marginTop: 8 }}>
                  <span className="hint">
                    {selected?.name} · {tx(lang, `${series.length} registro(s)`, `${series.length} ${series.length === 1 ? 'record' : 'records'}`)}
                  </span>
                  <span className="badge badge-warning">
                    <Icon name="spark" size={12} />{' '}
                    {tx(lang, `${series.filter((p) => p.pr).length} marca(s)`, `${series.filter((p) => p.pr).length} PR${series.filter((p) => p.pr).length === 1 ? '' : 's'}`)}
                  </span>
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
              <div className="card-title"><Icon name="body" /> {tx(lang, 'Mapa de calor muscular', 'Muscle heatmap')}</div>
              <div className="card-sub">
                {tx(lang, 'Series y minutos de los últimos 7 días por zona universal.', 'Sets and minutes from the last 7 days by universal zone.')}
              </div>
            </div>
          </div>
          <div className="card-body">
            <BodyHeatmap load={summary.zoneLoad} />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="alert" /> {tx(lang, 'Alertas de carga', 'Load alerts')}</div>
              <div className="card-sub">
                {tx(lang, 'Sobreentrenamiento por zona respecto a series y tiempo recomendados.', 'Overtraining by zone relative to recommended sets and time.')}
              </div>
            </div>
          </div>
          <div className="card-body stack">
            {alerts.length === 0 ? (
              <div className="notice notice-success">
                <Icon name="check" size={16} />
                <span>
                  {tx(
                    lang,
                    'Sin señales de sobreentrenamiento. Las zonas están dentro de rangos razonables.',
                    'No signs of overtraining. Zones are within reasonable ranges.',
                  )}
                </span>
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
            <div className="card-title"><Icon name="target" /> {tx(lang, 'Carga por zona', 'Load by zone')}</div>
            <div className="card-sub">
              {tx(
                lang,
                'Comparación con el rango semanal recomendado. La última columna indica el estado.',
                'Comparison with the recommended weekly range. The last column shows the status.',
              )}
            </div>
          </div>
        </div>
        <div className="card-body" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{tx(lang, 'Zona', 'Zone')}</th>
                <th>{tx(lang, 'Series', 'Sets')}</th>
                <th>{tx(lang, 'Minutos', 'Minutes')}</th>
                <th>{tx(lang, 'Recomendado', 'Recommended')}</th>
                <th>{tx(lang, 'Última sesión', 'Last session')}</th>
                <th>{tx(lang, 'Estado', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {BODY_ZONES.map((z) => {
                const load = summary.zoneLoad[z.id];
                const ratio = Math.max(
                  z.weeklySets[1] > 0 ? load.sets / z.weeklySets[1] : 0,
                  load.minutes / z.weeklyMinutes[1],
                );
                const status = ratio > 1.15
                  ? ['high', tx(lang, 'Exceso', 'Over')] as const
                  : ratio > 0.85
                    ? ['warn', tx(lang, 'Cerca del límite', 'Close to the limit')] as const
                    : ['ok', tx(lang, 'Dentro', 'Within')] as const;
                return (
                  <tr key={z.id}>
                    <td><span className="row"><span className="chip-dot" style={{ background: z.color }} />{zoneNameOf(z, lang)}</span></td>
                    <td className="mono">{load.sets}</td>
                    <td className="mono">{Math.round(load.minutes)}</td>
                    <td className="small muted">
                      {tx(
                        lang,
                        `${z.weeklySets[0]}–${z.weeklySets[1]} series · ${z.weeklyMinutes[0]}–${z.weeklyMinutes[1]} min`,
                        `${z.weeklySets[0]}–${z.weeklySets[1]} sets · ${z.weeklyMinutes[0]}–${z.weeklyMinutes[1]} min`,
                      )}
                    </td>
                    <td className="small">{load.lastDate ? formatShort(load.lastDate, lang) : '—'}</td>
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
            <div className="card-title"><Icon name="spark" /> {tx(lang, 'Marcas personales', 'Personal records')}</div>
            <div className="card-sub">
              {tx(lang, 'Detectadas al finalizar una sesión. Se ocultan si vacías el historial.', 'Detected when you finish a session. Hidden if you clear history.')}
            </div>
          </div>
          <span className="badge badge-warning">{prs.length}</span>
        </div>
        <div className="card-body">
          {prs.length === 0 ? (
            <p className="hint">
              {tx(
                lang,
                'Sin marcas todavía. La app compara el peso máximo por ejercicio con tu historial.',
                'No records yet. The app compares the max weight per exercise with your history.',
              )}
            </p>
          ) : (
            <div className="list">
              {prs.slice().reverse().slice(0, 20).map((p) => (
                <div key={`${p.date}-${p.exerciseId}-${p.weight}`} className="list-item">
                  <div className="list-item-main">
                    <span className="list-item-title"><Icon name="spark" size={12} /> {p.name}</span>
                    <span className="list-item-sub">{formatShort(p.date, lang)} · {p.weight} kg × {p.reps} reps</span>
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
            <div className="card-title"><Icon name="chart" /> {tx(lang, 'Progreso por zona', 'Progress by zone')}</div>
            <div className="card-sub">{tx(lang, 'Series semanales frente al máximo recomendado.', 'Weekly sets against the recommended maximum.')}</div>
          </div>
        </div>
        <div className="card-body stack" style={{ gap: 12 }}>
          {BODY_ZONES.map((z) => {
            const load = summary.zoneLoad[z.id];
            return (
              <ProgressBar
                key={z.id}
                label={`${zoneNameOf(z, lang)} · ${load.sets} ${tx(lang, 'series', 'sets')}`}
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
