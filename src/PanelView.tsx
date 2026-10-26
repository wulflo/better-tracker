import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BodyMeasures,
  Exercise,
  Food,
  FoodLogItem,
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
import { FOODS, mealTotals, reduceCustomFoods } from './foodDb';
import { clearMealDraft, loadMealDraft, saveMealDraft } from './meals';
import { ZONE_MAP } from './zones';
import Select from './components/Select';
import { NumberInput, Field, EmptyState, Stat } from './components/Fields';
import { Icon } from './components/Icons';
import { BodyHeatmap, MiniSparkline, ProgressBar } from './components/Charts';
import FoodLog from './components/FoodLog';
import FatTrend from './components/FatTrend';

interface Props {
  deviceId: string;
  events: VaultEvent[];
  exercises: Exercise[];
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onNavigate: (view: 'training' | 'history' | 'body') => void;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function emptyNutrition(date: string): NutritionEntry {
  return { date, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, water: 0 };
}

function emptyMacros(date: string): Pick<NutritionEntry, 'date' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber'> {
  return { date, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

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
  const [day, setDay] = useState(() => todayISO());
  const [mealItems, setMealItems] = useState<FoodLogItem[]>(() => loadMealDraft(todayISO()));
  const [nutri, setNutri] = useState<NutritionEntry>(() => emptyNutrition(todayISO()));
  const dirtyNutrition = useRef(false);
  const [goalMode, setGoalMode] = useState<GoalMode>(() => goalModeFromEvents(events));
  const [waterBusy, setWaterBusy] = useState(false);
  const waterSaving = useRef(false);
  const [remTitle, setRemTitle] = useState('');
  const [remTime, setRemTime] = useState('18:00');
  const [remDays, setRemDays] = useState<number[]>([1, 3, 5]);
  const firedRef = useRef<Set<string>>(new Set());

  // La bóveda se carga de forma asíncrona al abrir la app. Sin este efecto,
  // el modo elegido se quedaba en "mantener" hasta el siguiente clic.
  useEffect(() => {
    setGoalMode(goalModeFromEvents(events));
  }, [events]);

  const weights = useMemo(() => reduceWeights(events), [events]);
  const exerciseSummary = useMemo(() => trainingSummary(events, exercises), [events, exercises]);
  const zoneLoad = exerciseSummary.zoneLoad;
  const alerts = useMemo(() => trainingAlerts(exerciseSummary), [exerciseSummary]);
  const reminders = useMemo(() => reduceReminders(events), [events]);
  const customFoods = useMemo(() => reduceCustomFoods(events), [events]);
  const foods = useMemo(() => [...FOODS, ...customFoods], [customFoods]);
  const savedToday = useMemo(() => latestNutrition(events, day), [events, day]);

  const currentWeight =
    (weights.length ? weights[weights.length - 1].kg : 0) || lastMeas?.weight || 0;
  const baseMeasures: BodyMeasures = {
    ...EMPTY_MEASURES,
    ...(lastMeas ?? {}),
    weight: currentWeight || lastMeas?.weight || 0,
  };
  const macros = computeMacros(baseMeasures, exerciseSummary.weekMinutes, goalMode);
  const satiety = computeSatiety(nutri, macros);
  const waterTarget = macros?.waterMl ?? 2000;
  const waterCurrent = Math.max(0, Math.round(Number(nutri.water) || 0));
  const waterLeft = Math.max(0, waterTarget - waterCurrent);
  const waterPct = waterTarget > 0 ? Math.min(100, Math.round((waterCurrent / waterTarget) * 100)) : 0;
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
    const wasSaved = savedToday !== null;
    await appendEvent(newEvent(deviceId, 'nutrition.logged', { ...nutri, date: day }));
    dirtyNutrition.current = false;
    await onRefresh();
    notify(
      wasSaved
        ? 'Ingesta de hoy actualizada: se sobrescribió el log de este día.'
        : 'Ingesta de hoy guardada como log diario.',
      'success',
    );
  };

  const createFood = async (food: Food) => {
    await appendEvent(newEvent(deviceId, 'food.saved', food));
    await onRefresh();
    notify(`Alimento "${food.name}" añadido a la base local.`, 'success');
  };

  const addMeal = (item: FoodLogItem) => {
    dirtyNutrition.current = true;
    setMealItems((items) => [...items, item]);
  };

  const removeMeal = (id: string) => {
    const next = mealItems.filter((item) => item.id !== id);
    dirtyNutrition.current = true;
    setMealItems(next);
    if (!next.length) {
      setNutri((current) => ({ ...current, ...emptyMacros(day) }));
    }
  };

  const clearMeals = () => {
    dirtyNutrition.current = true;
    setMealItems([]);
    setNutri((current) => ({ ...current, ...emptyMacros(day) }));
  };

  const changeNutri = (patch: Partial<NutritionEntry>) => {
    dirtyNutrition.current = true;
    setNutri((current) => ({ ...current, ...patch, date: day }));
  };

  const changeGoal = async (mode: GoalMode) => {
    setGoalMode(mode);
    await appendEvent(newEvent(deviceId, 'goal.mode', { mode }));
    await onRefresh();
  };

  const logWater = async (delta: number) => {
    if (waterSaving.current) return;
    const current = waterCurrent;
    const next = Math.min(10000, Math.max(0, current + delta));
    if (next === current) return;

    waterSaving.current = true;
    setWaterBusy(true);
    setNutri((value) => ({ ...value, water: next, date: day }));
    try {
      // El agua forma parte del log diario de ingesta. Se guarda al momento
      // conservando los macros ya registrados para ese día.
      const base = savedToday ?? emptyNutrition(day);
      await appendEvent(newEvent(deviceId, 'nutrition.logged', { ...base, date: day, water: next }));
      await onRefresh();
      if (current < waterTarget && next >= waterTarget) {
        notify('Objetivo de agua alcanzado.', 'success');
      }
    } catch (e) {
      setNutri((value) => ({ ...value, water: current, date: day }));
      notify(`No se pudo guardar el agua: ${String(e)}`, 'error');
    } finally {
      waterSaving.current = false;
      setWaterBusy(false);
    }
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

  useEffect(() => {
    if (dirtyNutrition.current) return;
    if (mealItems.length > 0) return;
    setNutri(savedToday ?? emptyNutrition(day));
  }, [savedToday, day, mealItems.length]);

  useEffect(() => {
    if (!mealItems.length) return;
    const totals = mealTotals(mealItems);
    setNutri((current) => ({
      ...current,
      ...emptyMacros(day),
      ...totals,
      water: current.water || savedToday?.water || 0,
    }));
  }, [mealItems, day, savedToday]);

  useEffect(() => {
    saveMealDraft(day, mealItems);
  }, [day, mealItems]);

  useEffect(() => {
    const check = () => {
      const current = todayISO();
      if (current === day) return;
      clearMealDraft();
      setDay(current);
      setMealItems([]);
      setNutri(emptyNutrition(current));
      dirtyNutrition.current = false;
    };
    const id = window.setInterval(check, 30_000);
    check();
    return () => window.clearInterval(id);
  }, [day]);

  const hasNutrition = mealItems.length > 0 || nutri.kcal > 0 || nutri.protein > 0 || nutri.carbs > 0 || nutri.fat > 0 || nutri.fiber > 0 || nutri.water > 0;
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
        <section className="card water-banner span-2" aria-label="Control de agua">
          <div className="water-banner-body">
            <div className="water-banner-top">
              <div className="water-banner-icon"><Icon name="water" size={24} /></div>
              <div className="water-banner-copy">
                <div className="water-banner-title">Agua de hoy</div>
                <div className="water-banner-sub">
                  {waterLeft > 0
                    ? `Te quedan ${(waterLeft / 1000).toFixed(2)} L para llegar al objetivo.`
                    : waterCurrent > waterTarget
                      ? `Objetivo superado por ${((waterCurrent - waterTarget) / 1000).toFixed(2)} L.`
                      : 'Objetivo cubierto.'}{' '}
                  Se guarda al momento en el log de hoy.
                </div>
              </div>
              <div className="water-banner-value">
                <strong>{(waterCurrent / 1000).toFixed(2)} L</strong>
                <span>de {(waterTarget / 1000).toFixed(1)} L</span>
              </div>
              <span className={`badge ${waterPct >= 100 ? 'badge-success' : 'badge-primary'}`}>{waterPct}%</span>
            </div>
            <ProgressBar
              label="Progreso de hidratación"
              valueLabel={`${waterCurrent} / ${waterTarget} ml`}
              value={waterCurrent}
              max={waterTarget}
              color="var(--info)"
            />
            <div className="water-banner-actions">
              {[250, 500, 1000].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className="btn btn-tonal btn-sm"
                  disabled={waterBusy || waterCurrent >= 10000}
                  onClick={() => void logWater(amount)}
                >
                  <Icon name="water" size={14} /> +{amount >= 1000 ? `${amount / 1000} L` : `${amount} ml`}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={waterBusy || waterCurrent === 0}
                onClick={() => void logWater(-250)}
              >
                −250 ml
              </button>
              {!macros && <span className="hint">Objetivo orientativo de 2 L. Añade tu peso para personalizarlo.</span>}
            </div>
          </div>
        </section>

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

        <FatTrend events={events} className="span-2" />

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

        <section className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="bowl" /> Ingesta y saciedad dual</div>
              <div className="card-sub">Añade alimentos del día, calcula calorías y macros automáticamente y guarda un único log diario. El borrador se borra al terminar el día.</div>
            </div>
            <span className={`badge ${savedToday ? 'badge-success' : 'badge-muted'}`}>
              {savedToday ? 'Log de hoy guardado' : 'Sin log de hoy'}
            </span>
          </div>
          <div className="card-body stack">
            <FoodLog
              foods={foods}
              items={mealItems}
              onAdd={addMeal}
              onRemove={removeMeal}
              onClear={clearMeals}
              onCreateFood={createFood}
            />

            <div className="divider" />

            <div className="row between wrap">
              <span className="badge badge-primary"><Icon name="calendar" size={12} /> Hoy · {day}</span>
              <span className="hint">El log diario se guarda una sola vez por fecha; guardar de nuevo sobrescribe el de hoy.</span>
            </div>

            <div className="grid grid-2" style={{ gap: 10 }}>
              <Field label="Agua (ml)">
                <NumberInput value={nutri.water} onChange={(v) => changeNutri({ water: v })} placeholder="2500" min={0} max={10000} step={100} />
              </Field>
              <div className="stack-sm">
                <span className="field-label">Totales actuales</span>
                <div className="chips">
                  <span className="chip active">{nutri.kcal} kcal</span>
                  <span className="chip active">{nutri.protein} g proteína</span>
                  <span className="chip active">{nutri.carbs} g carbohidratos</span>
                  <span className="chip active">{nutri.fat} g grasas</span>
                  <span className="chip active">{nutri.fiber} g fibra</span>
                </div>
              </div>
            </div>

            <details className="details">
              <summary>Ajustar macros manualmente (opcional)</summary>
              <div className="grid grid-3" style={{ marginTop: 12 }}>
                <Field label="Calorías (kcal)"><NumberInput value={nutri.kcal} onChange={(v) => changeNutri({ kcal: v })} placeholder="2200" min={0} max={8000} /></Field>
                <Field label="Proteína (g)"><NumberInput value={nutri.protein} onChange={(v) => changeNutri({ protein: v })} placeholder="135" min={0} max={500} /></Field>
                <Field label="Carbohidratos (g)"><NumberInput value={nutri.carbs} onChange={(v) => changeNutri({ carbs: v })} placeholder="250" min={0} max={1000} /></Field>
                <Field label="Grasas (g)"><NumberInput value={nutri.fat} onChange={(v) => changeNutri({ fat: v })} placeholder="70" min={0} max={400} /></Field>
                <Field label="Fibra (g)"><NumberInput value={nutri.fiber} onChange={(v) => changeNutri({ fiber: v })} placeholder="30" min={0} max={150} /></Field>
              </div>
            </details>

            <div className="row between wrap">
              <button className="btn btn-primary" onClick={saveNutrition} disabled={!hasNutrition}>
                <Icon name="check" size={15} /> {savedToday ? 'Actualizar ingesta de hoy' : 'Guardar ingesta de hoy'}
              </button>
              {macros && <span className="hint">Objetivo: {macros.kcal} kcal · {macros.protein} g proteína · {(macros.waterMl / 1000).toFixed(1)} L</span>}
            </div>

            {!macros ? (
              <p className="hint">Añade tu peso para comparar la ingesta con tus objetivos.</p>
            ) : !hasNutrition ? (
              <div className="notice notice-info">
                <Icon name="info" size={16} />
                <span>Añade comidas o agua para ver las dos vías de saciedad.</span>
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
