import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BodyMeasures,
  Exercise,
  GoalMode,
  MeasurementEntry,
  NutritionEntry,
  Reminder,
  Sex,
  VaultEvent,
} from './types';
import { EMPTY_MEASURES } from './types';
import { appendEvent, newEvent } from './vault';
import {
  bodyComposition,
  computeMacros,
  computeSatiety,
  fmtDuration,
  goalModeFromEvents,
  latestMeasurement,
  latestNutrition,
  minutesLabel,
  reduceReminders,
  reduceWeights,
  todayISO,
  trainingAlerts,
  trainingSummary,
} from './metrics';
import { ZONE_MAP } from './zones';
import Select from './components/Select';
import { NumberInput, Field, EmptyState, Stat } from './components/Fields';
import { Icon } from './components/Icons';
import { BodyHeatmap, MiniSparkline, ProgressBar } from './components/Charts';

interface Props {
  deviceId: string;
  events: VaultEvent[];
  exercises: Exercise[];
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onNavigate: (view: 'training' | 'history' | 'body') => void;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function PanelView({ deviceId, events, exercises, onRefresh, notify, onNavigate }: Props) {
  const lastMeas = latestMeasurement(events);
  const lastMeasEventId = [...events].reverse().find((e) => e.kind === 'measurement.saved')?.id;
  const [measForm, setMeasForm] = useState<MeasurementEntry>({
    ...EMPTY_MEASURES,
    ...(lastMeas ?? {}),
    date: lastMeas?.date ?? todayISO(),
  });
  useEffect(() => {
    if (!lastMeasEventId) return;
    const latest = latestMeasurement(events);
    if (latest) setMeasForm({ ...EMPTY_MEASURES, ...latest, date: latest.date });
  }, [lastMeasEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [weightDate, setWeightDate] = useState(todayISO());
  const [weightKg, setWeightKg] = useState(0);
  const [nutri, setNutri] = useState<NutritionEntry>({
    date: todayISO(),
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    water: 0,
  });
  const [goalMode, setGoalMode] = useState<GoalMode>(() => goalModeFromEvents(events));
  const [remTitle, setRemTitle] = useState('');
  const [remTime, setRemTime] = useState('18:00');
  const [remDays, setRemDays] = useState<number[]>([1, 3, 5]);
  const firedRef = useRef<Set<string>>(new Set());

  const weights = useMemo(() => reduceWeights(events), [events]);
  const exerciseSummary = useMemo(() => trainingSummary(events, exercises), [events, exercises]);
  const zoneLoad = exerciseSummary.zoneLoad;
  const alerts = useMemo(() => trainingAlerts(exerciseSummary), [exerciseSummary]);
  const reminders = useMemo(() => reduceReminders(events), [events]);

  const currentWeight =
    (weights.length ? weights[weights.length - 1].kg : 0) || lastMeas?.weight || 0;
  const baseMeasures: BodyMeasures = {
    ...EMPTY_MEASURES,
    ...(lastMeas ?? {}),
    weight: currentWeight || lastMeas?.weight || 0,
  };
  const macros = computeMacros(baseMeasures, exerciseSummary.weekMinutes, goalMode);
  const satiety = computeSatiety(nutri, macros);
  const comp = bodyComposition(baseMeasures);
  const bmi = comp.bmi;
  const fatAvg = comp.avg;

  const changeMeas = <K extends keyof MeasurementEntry>(key: K, value: MeasurementEntry[K]) => {
    setMeasForm((f) => ({ ...f, [key]: value }));
  };
  const changeBody = <K extends keyof BodyMeasures>(key: K, value: BodyMeasures[K]) => {
    setMeasForm((f) => ({ ...f, [key]: value }));
  };

  const saveWeight = async () => {
    if (weightKg < 20 || weightKg > 400) {
      notify('Introduce un peso entre 20 y 400 kg.', 'error');
      return;
    }
    await appendEvent(newEvent(deviceId, 'weight.logged', { date: weightDate, kg: weightKg }));
    setWeightKg(0);
    await onRefresh();
    notify('Peso registrado.', 'success');
  };

  const saveMeasurements = async () => {
    if (measForm.weight < 0 || measForm.height < 0) {
      notify('Las medidas no pueden ser negativas.', 'error');
      return;
    }
    await appendEvent(newEvent(deviceId, 'measurement.saved', { ...measForm }));
    await onRefresh();
    notify('Medidas guardadas.', 'success');
  };

  const saveNutrition = async () => {
    if (nutri.kcal < 0 || nutri.protein < 0 || nutri.carbs < 0 || nutri.fat < 0 || nutri.fiber < 0 || nutri.water < 0) {
      notify('Los valores de ingesta no pueden ser negativos.', 'error');
      return;
    }
    await appendEvent(newEvent(deviceId, 'nutrition.logged', { ...nutri }));
    await onRefresh();
    notify('Ingesta del día guardada.', 'success');
  };

  const changeGoal = async (mode: GoalMode) => {
    setGoalMode(mode);
    await appendEvent(newEvent(deviceId, 'goal.mode', { mode }));
    await onRefresh();
  };

  const toggleRemDay = (d: number) => {
    setRemDays((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()));
  };

  const saveReminder = async () => {
    if (!remTitle.trim()) {
      notify('Escribe un título para el recordatorio.', 'error');
      return;
    }
    const r: Reminder = {
      id: crypto.randomUUID(),
      title: remTitle.trim(),
      time: remTime,
      days: remDays.length ? remDays : [1, 2, 3, 4, 5, 6, 0],
      enabled: true,
    };
    await appendEvent(newEvent(deviceId, 'reminder.saved', r));
    setRemTitle('');
    await onRefresh();
    notify('Recordatorio guardado. Se avisará mientras la app esté abierta.', 'success');
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  const deleteReminder = async (id: string) => {
    await appendEvent(newEvent(deviceId, 'reminder.deleted', { id }));
    await onRefresh();
  };

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const key = `${todayISO(now)}-${hhmm}`;
      for (const r of reminders) {
        if (!r.enabled || r.time !== hhmm || !r.days.includes(now.getDay())) continue;
        const fired = `${r.id}-${key}`;
        if (firedRef.current.has(fired)) continue;
        firedRef.current.add(fired);
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Better Tracker', { body: r.title });
        }
        notify(`Recordatorio: ${r.title}`, 'info');
      }
    };
    const id = window.setInterval(check, 30_000);
    check();
    return () => window.clearInterval(id);
  }, [reminders, notify]);

  const loadNutritionForDate = (date: string) => {
    const existing = latestNutrition(events, date);
    setNutri(
      existing ?? { date, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, water: 0 },
    );
  };

  const hasNutrition = nutri.kcal > 0 || nutri.protein > 0 || nutri.carbs > 0 || nutri.fat > 0 || nutri.fiber > 0 || nutri.water > 0;
  const topZone = exerciseSummary.topZone;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Panel</h1>
          <p className="page-sub">
            Tu centro diario: peso, composición, macros, agua, saciedad dual y carga de entrenamiento.
          </p>
        </div>
        <div className="page-actions">
          <span className="badge badge-primary">
            <Icon name="calendar" size={12} /> {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
      </header>

      <div className="grid grid-4">
        <Stat
          label="Peso actual"
          value={currentWeight ? `${currentWeight.toFixed(1)} kg` : '—'}
          caption={weights.length ? `Último registro ${weights[weights.length - 1].date}` : 'Registra tu peso abajo'}
        />
        <Stat
          label="IMC"
          value={bmi ? bmi.toFixed(1) : '—'}
          caption={bmi ? (bmi < 18.5 ? 'Bajo peso' : bmi < 25 ? 'Rango normal' : bmi < 30 ? 'Sobrepeso' : 'Obesidad') : 'Faltan peso y altura'}
        />
        <Stat
          label="% grasa estimado"
          value={fatAvg !== null ? `${fatAvg.toFixed(1)}%` : '—'}
          caption={comp.methods.length ? `${comp.methods.length} método(s) disponibles` : 'Añade cintura, cuello o edad'}
        />
        <Stat
          label="Sesiones esta semana"
          value={exerciseSummary.weekSessions}
          caption={`${minutesLabel(exerciseSummary.weekMinutes)} · ${exerciseSummary.weekSets} series`}
        />
      </div>

      <div className="grid grid-2">
        <section className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="scale" /> Peso y composición</div>
              <div className="card-sub">Registra el peso rápido y, cuando puedas, añade medidas. Más datos = mejor estimación.</div>
            </div>
            <div className="badge badge-muted">{lastMeas ? `Última medida ${lastMeas.date}` : 'Sin medidas'}</div>
          </div>
          <div className="card-body stack">
            <div className="row wrap" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ minWidth: 150 }}>
                <span className="field-label">Fecha de peso</span>
                <input className="input" type="date" value={weightDate} onChange={(e) => setWeightDate(e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 120 }}>
                <span className="field-label">Peso (kg)</span>
                <NumberInput value={weightKg} onChange={setWeightKg} placeholder="75.0" min={20} max={400} step={0.1} />
              </div>
              <button className="btn btn-primary" onClick={saveWeight}><Icon name="plus" size={15} /> Registrar peso</button>
              {weights.length > 1 && (
                <div style={{ marginLeft: 'auto', minWidth: 160 }}>
                  <MiniSparkline values={weights.slice(-14).map((w) => w.kg)} />
                </div>
              )}
            </div>

            <div className="divider" />

            <div className="grid grid-4">
              <Field label="Fecha"><input className="input" type="date" value={measForm.date} onChange={(e) => changeMeas('date', e.target.value)} /></Field>
              <Field label="Sexo">
                <Select
                  value={measForm.sex}
                  onChange={(v) => changeBody('sex', v as Sex)}
                  options={[
                    { value: 'unspecified', label: 'Sin especificar' },
                    { value: 'male', label: 'Hombre' },
                    { value: 'female', label: 'Mujer' },
                  ]}
                />
              </Field>
              <Field label="Edad"><NumberInput value={measForm.age} onChange={(v) => changeBody('age', v)} placeholder="30" min={10} max={100} /></Field>
              <Field label="Altura (cm)"><NumberInput value={measForm.height} onChange={(v) => changeBody('height', v)} placeholder="175" min={100} max={230} /></Field>
              <Field label="Peso composición (kg)"><NumberInput value={measForm.weight} onChange={(v) => changeBody('weight', v)} placeholder="75" min={20} max={400} step={0.1} /></Field>
              <Field label="Cuello (cm)"><NumberInput value={measForm.neck} onChange={(v) => changeBody('neck', v)} placeholder="38" min={20} max={70} /></Field>
              <Field label="Cintura (cm)"><NumberInput value={measForm.waist} onChange={(v) => changeBody('waist', v)} placeholder="85" min={40} max={180} /></Field>
              <Field label="Cadera (cm)"><NumberInput value={measForm.hip} onChange={(v) => changeBody('hip', v)} placeholder="95" min={40} max={180} /></Field>
            </div>

            <details className="details">
              <summary>Más medidas para la figura corporal</summary>
              <div className="grid grid-4" style={{ marginTop: 12 }}>
                <Field label="Pecho (cm)"><NumberInput value={measForm.chest} onChange={(v) => changeBody('chest', v)} placeholder="100" /></Field>
                <Field label="Brazo (cm)"><NumberInput value={measForm.arm} onChange={(v) => changeBody('arm', v)} placeholder="32" /></Field>
                <Field label="Muslo (cm)"><NumberInput value={measForm.thigh} onChange={(v) => changeBody('thigh', v)} placeholder="55" /></Field>
                <Field label="Pantorrilla (cm)"><NumberInput value={measForm.calf} onChange={(v) => changeBody('calf', v)} placeholder="38" /></Field>
                <Field label="Muñeca (cm)"><NumberInput value={measForm.wrist} onChange={(v) => changeBody('wrist', v)} placeholder="17" /></Field>
              </div>
            </details>

            <div className="row between wrap">
              <div className="row wrap">
                <span className="badge badge-muted">IMC {comp.bmi ? comp.bmi.toFixed(1) : '—'}</span>
                <span className="badge badge-muted">% grasa {comp.avg !== null ? `${comp.avg.toFixed(1)}%` : '—'}</span>
                <span className="badge badge-muted">Masa magra {comp.leanMass !== null ? `${comp.leanMass.toFixed(1)} kg` : '—'}</span>
                <span className="badge badge-muted">Cintura/cadera {comp.whr !== null ? comp.whr.toFixed(2) : '—'}</span>
              </div>
              <button className="btn btn-tonal" onClick={saveMeasurements}><Icon name="check" size={15} /> Guardar medidas</button>
            </div>
            {comp.missing.length > 0 && (
              <p className="hint">Para mejorar la estimación faltan: {comp.missing.join(', ')}. La app usa los métodos disponibles sin exigir todos los datos.</p>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="target" /> Macros y agua</div>
              <div className="card-sub">Calculado con tu peso, altura, edad, sexo y minutos de entrenamiento de los últimos 7 días.</div>
            </div>
          </div>
          <div className="card-body stack">
            <div className="segmented" role="tablist" aria-label="Objetivo">
              {([
                ['cut', 'Perder grasa'],
                ['maintain', 'Mantener'],
                ['bulk', 'Ganar músculo'],
              ] as Array<[GoalMode, string]>).map(([mode, label]) => (
                <button key={mode} type="button" className={`segment ${goalMode === mode ? 'active' : ''}`} onClick={() => void changeGoal(mode)}>
                  {label}
                </button>
              ))}
            </div>

            {macros ? (
              <>
                <div className="grid grid-2" style={{ gap: 10 }}>
                  <Stat label="Calorías" value={`${macros.kcal}`} caption="kcal/día" />
                  <Stat label="Proteína" value={`${macros.protein} g`} caption={`${(macros.protein / (baseMeasures.weight || 1)).toFixed(1)} g/kg`} />
                  <Stat label="Carbohidratos" value={`${macros.carbs} g`} caption="energía y glucógeno" />
                  <Stat label="Grasas" value={`${macros.fat} g`} caption="hormonas y saciedad" />
                </div>
                <div className="notice notice-info">
                  <Icon name="water" size={17} />
                  <div>
                    <strong>Agua objetivo: {(macros.waterMl / 1000).toFixed(1)} L/día</strong>
                    <div className="small">35 ml/kg + 500 ml por hora media de entrenamiento. Fibra objetivo: {macros.fiber} g/día.</div>
                  </div>
                </div>
                {macros.missing.length > 0 && (
                  <p className="hint">Estimación adaptativa: faltan {macros.missing.join(', ')}. {macros.notes.join(' ')}</p>
                )}
              </>
            ) : (
              <EmptyState
                icon={<Icon name="scale" />}
                title="Falta tu peso"
                sub="Añade tu peso (y altura/edad si puedes) para calcular macros, agua y saciedad."
              />
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="bowl" /> Saciedad dual</div>
              <div className="card-sub">Presión gástrica (volumen, fibra, agua) + señal bioquímica (proteína, fibra, grasas). No es una sola vía.</div>
            </div>
          </div>
          <div className="card-body stack">
            <div className="grid grid-2" style={{ gap: 10 }}>
              <Field label="Fecha de ingesta"><input className="input" type="date" value={nutri.date} onChange={(e) => loadNutritionForDate(e.target.value)} /></Field>
              <Field label="Calorías (kcal)"><NumberInput value={nutri.kcal} onChange={(v) => setNutri({ ...nutri, kcal: v })} placeholder="2200" min={0} max={8000} /></Field>
              <Field label="Proteína (g)"><NumberInput value={nutri.protein} onChange={(v) => setNutri({ ...nutri, protein: v })} placeholder="135" min={0} max={500} /></Field>
              <Field label="Carbohidratos (g)"><NumberInput value={nutri.carbs} onChange={(v) => setNutri({ ...nutri, carbs: v })} placeholder="250" min={0} max={1000} /></Field>
              <Field label="Grasas (g)"><NumberInput value={nutri.fat} onChange={(v) => setNutri({ ...nutri, fat: v })} placeholder="70" min={0} max={400} /></Field>
              <Field label="Fibra (g)"><NumberInput value={nutri.fiber} onChange={(v) => setNutri({ ...nutri, fiber: v })} placeholder="30" min={0} max={150} /></Field>
              <Field label="Agua (ml)"><NumberInput value={nutri.water} onChange={(v) => setNutri({ ...nutri, water: v })} placeholder="2500" min={0} max={10000} step={100} /></Field>
            </div>
            <div className="row between">
              <button className="btn btn-primary btn-sm" onClick={saveNutrition}><Icon name="check" size={14} /> Guardar ingesta</button>
              {macros && <span className="hint">Objetivo: {macros.kcal} kcal · {macros.protein} g proteína · {(macros.waterMl / 1000).toFixed(1)} L</span>}
            </div>
            {!macros ? (
              <p className="hint">Añade tu peso para comparar la ingesta con tus objetivos.</p>
            ) : !hasNutrition ? (
              <div className="notice notice-info">
                <Icon name="info" size={16} />
                <span>Registra tu ingesta del día para ver las dos vías de saciedad.</span>
              </div>
            ) : satiety && (
              <div className="stack">
                <ProgressBar label="Presión gástrica" valueLabel={`${Math.round(satiety.pressure)}%`} value={satiety.pressure} color="var(--info)" />
                <ProgressBar label="Señal bioquímica" valueLabel={`${Math.round(satiety.biochem)}%`} value={satiety.biochem} color="var(--tertiary)" />
                <div className={`notice ${satiety.tone === 'good' ? 'notice-success' : satiety.tone === 'bad' ? 'notice-error' : 'notice-warn'}`}>
                  <Icon name={satiety.tone === 'good' ? 'check' : 'alert'} size={17} />
                  <div>
                    <strong>{satiety.diagnosis}</strong>
                    <div className="small">{satiety.tip}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="dumbbell" /> Entrenamiento</div>
              <div className="card-sub">Resumen de los últimos 7 días y mapa de calor muscular.</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('training')}>Ver todo <Icon name="chevron" size={14} /></button>
          </div>
          <div className="card-body">
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="stack-sm">
                <Stat label="Sesiones" value={exerciseSummary.weekSessions} caption={minutesLabel(exerciseSummary.weekMinutes)} />
                <Stat label="Series" value={exerciseSummary.weekSets} caption={`${Math.round(exerciseSummary.weekVolume).toLocaleString('es')} kg de volumen`} />
              </div>
              <BodyHeatmap load={zoneLoad} compact />
            </div>
            <div className="row between" style={{ marginTop: 12 }}>
              <span className="hint">
                {topZone ? `Zona más cargada: ${ZONE_MAP[topZone].name}` : 'Sin datos de zonas todavía.'}
              </span>
              {alerts.length > 0 ? (
                <span className="badge badge-warning"><Icon name="alert" size={12} /> {alerts.length} alerta(s)</span>
              ) : (
                <span className="badge badge-success"><Icon name="check" size={12} /> Carga equilibrada</span>
              )}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="alert" /> Alertas de sobreentrenamiento</div>
              <div className="card-sub">Compara series y minutos por zona con rangos semanales recomendados.</div>
            </div>
          </div>
          <div className="card-body stack">
            {alerts.length === 0 ? (
              <div className="notice notice-success">
                <Icon name="check" size={17} />
                <div>
                  <strong>Sin señales de sobreentrenamiento</strong>
                  <div className="small">Las zonas entrenadas esta semana están dentro de rangos razonables.</div>
                </div>
              </div>
            ) : (
              alerts.slice(0, 5).map((a) => (
                <div key={a.id} className={`notice ${a.severity === 'high' ? 'notice-error' : a.severity === 'warn' ? 'notice-warn' : 'notice-info'}`}>
                  <Icon name="alert" size={16} />
                  <div>
                    <strong>{a.title}</strong>
                    <div className="small">{a.detail}</div>
                  </div>
                </div>
              ))
            )}
            {alerts.length > 5 && <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('training')}>Ver todas</button>}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="clock" /> Recordatorios</div>
              <div className="card-sub">Avisos locales mientras la app está abierta.</div>
            </div>
          </div>
          <div className="card-body stack">
            <div className="grid grid-2" style={{ gap: 10 }}>
              <Field label="Título"><input className="input" value={remTitle} onChange={(e) => setRemTitle(e.target.value)} placeholder="Tomar agua" /></Field>
              <Field label="Hora"><input className="input" type="time" value={remTime} onChange={(e) => setRemTime(e.target.value)} /></Field>
            </div>
            <div className="chips">
              {DAY_NAMES.map((d, i) => (
                <button key={d} type="button" className={`chip ${remDays.includes(i) ? 'active' : ''}`} onClick={() => toggleRemDay(i)}>{d}</button>
              ))}
            </div>
            <button className="btn btn-tonal btn-sm" onClick={saveReminder}><Icon name="plus" size={14} /> Añadir recordatorio</button>
            {reminders.length === 0 ? (
              <p className="hint">Sin recordatorios.</p>
            ) : (
              <div className="list">
                {reminders.map((r) => (
                  <div key={r.id} className="list-item">
                    <div className="list-item-main">
                      <span className="list-item-title">{r.title}</span>
                      <span className="list-item-sub">{r.time} · {r.days.map((d) => DAY_NAMES[d]).join(', ')}</span>
                    </div>
                    <button className="btn-icon" aria-label={`Eliminar ${r.title}`} onClick={() => void deleteReminder(r.id)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="row between wrap">
        <span className="hint">
          Los cálculos son estimaciones orientativas, no consejo médico. Fórmulas: Navy, RFM, Deurenberg, CUN-BAE, Mifflin-St Jeor, Katch-McArdle y Cunningham.
        </span>
        <span className="hint">{events.length} eventos · {fmtDuration(exerciseSummary.weekMinutes * 60)} de entrenamiento semanal</span>
      </div>
    </div>
  );
}
