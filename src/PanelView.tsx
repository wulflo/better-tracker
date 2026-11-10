import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActivityLevel,
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
  ACTIVITY_LEVELS,
  AUTO_ACTIVITY,
  activityLevelFromEvents,
  activityOption,
  averageStepsFromEvents,
  bodyComposition,
  computeMacros,
  computeSatiety,
  computeWaterGuidance,
  fmtDuration,
  formatShort,
  goalModeFromEvents,
  latestMeasurement,
  latestNutrition,
  minutesLabel,
  reduceReminders,
  reduceWeights,
  stepActivityMultiplier,
  todayISO,
  trainingAlerts,
  trainingSummary,
} from './metrics';
import { classifyValue, projectBody, safeBmiRange, safeBodyFatRange } from './bodyRange';
import { goalLabel, recipeLogItems, recommendRecipes } from './recipes';
import { FOODS, mealGrams, mealTotals, reduceCustomFoods } from './foodDb';
import { clearMealDraft, loadMealDraft, saveMealDraft } from './meals';
import { zoneName } from './zones';
import Select from './components/Select';
import { NumberInput, Field, EmptyState, Stat } from './components/Fields';
import { Icon } from './components/Icons';
import { BodyHeatmap, MiniSparkline, ProgressBar } from './components/Charts';
import FoodLog from './components/FoodLog';
import FatTrend from './components/FatTrend';
import { useLanguage, tx, locale } from './i18n';
import { mealSlotLabel } from './foodDb';

interface Props {
  deviceId: string;
  events: VaultEvent[];
  exercises: Exercise[];
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onNavigate: (view: 'training' | 'history' | 'body') => void;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayNames(lang: 'es' | 'en'): string[] {
  return lang === 'en' ? DAY_NAMES_EN : DAY_NAMES;
}

type PanelTab = 'summary' | 'body' | 'nutrition' | 'reminders';

const PANEL_TABS: Array<[PanelTab, string, string]> = [
  ['summary', 'Resumen', 'Summary'],
  ['body', 'Cuerpo', 'Body'],
  ['nutrition', 'Nutrición', 'Nutrition'],
  ['reminders', 'Recordatorios', 'Reminders'],
];

function emptyNutrition(date: string): NutritionEntry {
  return { date, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, water: 0 };
}

function emptyMacros(date: string): Pick<NutritionEntry, 'date' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber'> {
  return { date, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

export default function PanelView({ deviceId, events, exercises, onRefresh, notify, onNavigate }: Props) {
  const { lang } = useLanguage();
  const [tab, setTab] = useState<PanelTab>('summary');
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
  const [activity, setActivity] = useState<ActivityLevel>(() => activityLevelFromEvents(events));
  const lastStepsEventId = [...events].reverse().find((e) => e.kind === 'steps.average')?.id;
  const [steps, setSteps] = useState(() => averageStepsFromEvents(events));
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
    setActivity(activityLevelFromEvents(events));
  }, [events]);

  useEffect(() => {
    setSteps(averageStepsFromEvents(events));
  }, [lastStepsEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const weights = useMemo(() => reduceWeights(events), [events]);
  const exerciseSummary = useMemo(() => trainingSummary(events, exercises), [events, exercises]);
  const zoneLoad = exerciseSummary.zoneLoad;
  const alerts = useMemo(() => trainingAlerts(exerciseSummary, new Date(), lang), [exerciseSummary, lang]);
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
  const macros = computeMacros(baseMeasures, exerciseSummary.weekMinutes, goalMode, activity, lang, steps);
  const stepActivity = stepActivityMultiplier(steps);
  const comp = bodyComposition(baseMeasures, lang);
  const projection = useMemo(
    () =>
      projectBody(
        baseMeasures,
        goalMode,
        exerciseSummary.weekMinutes,
        activity,
        comp,
        lang,
        exerciseSummary.strengthPerMonth,
        steps,
      ),
    [
      baseMeasures,
      goalMode,
      exerciseSummary.weekMinutes,
      exerciseSummary.strengthPerMonth,
      activity,
      comp,
      lang,
      steps,
    ],
  );
  const bmiRange = safeBmiRange(baseMeasures.age, lang);
  const fatRange = safeBodyFatRange(baseMeasures.sex, baseMeasures.age, lang);
  const bmiStatus = classifyValue(comp.bmi, bmiRange, lang);
  const bmi = comp.bmi;
  const fatAvg = comp.avg;
  const draftGrams = mealGrams(mealItems);
  const satiety = computeSatiety(nutri, macros, {
    grams: draftGrams || undefined,
    bodyFat: fatAvg,
    leanMass: comp.leanMass,
    weightKg: baseMeasures.weight,
    weeklyMinutes: exerciseSummary.weekMinutes,
  }, lang);
  const waterCurrent = Math.max(0, Math.round(Number(nutri.water) || 0));
  const waterGuidance = computeWaterGuidance(baseMeasures, exerciseSummary.weekMinutes, waterCurrent, lang);
  const waterTarget = waterGuidance.targetMl;
  const waterSafeMax = waterGuidance.safeMaxMl;
  const waterPct = waterTarget > 0 ? Math.round((waterCurrent / waterTarget) * 100) : 0;
  const waterOver = waterGuidance.status === 'excess' || waterGuidance.status === 'danger';

  const changeMeas = <K extends keyof MeasurementEntry>(key: K, value: MeasurementEntry[K]) => {
    setMeasForm((f) => ({ ...f, [key]: value }));
  };
  const changeBody = <K extends keyof BodyMeasures>(key: K, value: BodyMeasures[K]) => {
    setMeasForm((f) => ({ ...f, [key]: value }));
  };

  const saveWeight = async () => {
    if (weightKg < 20 || weightKg > 400) {
      notify(tx(lang, 'Introduce un peso entre 20 y 400 kg.', 'Enter a weight between 20 and 400 kg.'), 'error');
      return;
    }
    await appendEvent(newEvent(deviceId, 'weight.logged', { date: weightDate, kg: weightKg }));
    setWeightKg(0);
    await onRefresh();
    notify(tx(lang, 'Peso registrado.', 'Weight logged.'), 'success');
  };

  const saveMeasurements = async () => {
    if (measForm.weight < 0 || measForm.height < 0) {
      notify(tx(lang, 'Las medidas no pueden ser negativas.', 'Measurements cannot be negative.'), 'error');
      return;
    }
    await appendEvent(newEvent(deviceId, 'measurement.saved', { ...measForm }));
    await onRefresh();
    notify(tx(lang, 'Medidas guardadas.', 'Measurements saved.'), 'success');
  };

  const saveNutrition = async () => {
    if (nutri.kcal < 0 || nutri.protein < 0 || nutri.carbs < 0 || nutri.fat < 0 || nutri.fiber < 0 || nutri.water < 0) {
      notify(tx(lang, 'Los valores de ingesta no pueden ser negativos.', 'Intake values cannot be negative.'), 'error');
      return;
    }
    const wasSaved = savedToday !== null;
    await appendEvent(newEvent(deviceId, 'nutrition.logged', { ...nutri, date: day }));
    dirtyNutrition.current = false;
    await onRefresh();
    notify(
      wasSaved
        ? tx(
            lang,
            'Ingesta de hoy actualizada: se sobrescribió el log de este día.',
            "Today's intake updated: this day's log was overwritten.",
          )
        : tx(lang, 'Ingesta de hoy guardada como log diario.', "Today's intake saved as a daily log."),
      'success',
    );
  };

  const createFood = async (food: Food) => {
    await appendEvent(newEvent(deviceId, 'food.saved', food));
    await onRefresh();
    notify(
      tx(
        lang,
        `Alimento "${food.name}" añadido a la base local.`,
        `Food "${food.name}" added to the local database.`,
      ),
      'success',
    );
  };

  const addMeal = (item: FoodLogItem) => {
    dirtyNutrition.current = true;
    setMealItems((items) => [...items, item]);
  };

  const updateMeal = (updated: FoodLogItem) => {
    dirtyNutrition.current = true;
    setMealItems((items) => items.map((item) => (item.id === updated.id ? updated : item)));
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

  const changeActivity = async (level: ActivityLevel) => {
    setActivity(level);
    await appendEvent(newEvent(deviceId, 'activity.level', { level }));
    await onRefresh();
  };

  const saveSteps = async () => {
    const value = Math.max(0, Math.round(Number(steps) || 0));
    setSteps(value);
    await appendEvent(newEvent(deviceId, 'steps.average', { steps: value }));
    await onRefresh();
    notify(
      tx(lang, 'Pasos promedio guardados.', 'Average steps saved.'),
      'success',
    );
  };

  const remainingMacros = macros
    ? {
        kcal: Math.max(0, macros.kcal - (Number(nutri.kcal) || 0)),
        protein: Math.max(0, macros.protein - (Number(nutri.protein) || 0)),
        carbs: Math.max(0, macros.carbs - (Number(nutri.carbs) || 0)),
        fat: Math.max(0, macros.fat - (Number(nutri.fat) || 0)),
      }
    : null;
  const recipeSuggestions = recommendRecipes(goalMode, remainingMacros, 3, lang);

  const addRecipe = (recipe: (typeof recipeSuggestions)[number]) => {
    const items = recipeLogItems(recipe);
    for (const item of items) addMeal(item);
    notify(
      tx(
        lang,
        `${recipe.name}: ${items.length} ingredientes añadidos a ${mealSlotLabel(recipe.meal, lang)}.`,
        `${recipe.name}: ${items.length} ingredients added to ${mealSlotLabel(recipe.meal, lang)}.`,
      ),
      'success',
    );
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
      if (next > waterSafeMax && current <= waterSafeMax) {
        notify(
          tx(
            lang,
            `Has superado tu límite seguro de agua (${(waterSafeMax / 1000).toFixed(1)} L). No fuerces más bebida hoy.`,
            `You have exceeded your safe water limit (${(waterSafeMax / 1000).toFixed(1)} L). Do not force more fluids today.`,
          ),
          'error',
        );
      } else if (current < waterTarget && next >= waterTarget) {
        notify(tx(lang, 'Objetivo de agua alcanzado.', 'Water goal reached.'), 'success');
      }
    } catch (e) {
      setNutri((value) => ({ ...value, water: current, date: day }));
      notify(
        tx(lang, `No se pudo guardar el agua: ${String(e)}`, `Could not save water: ${String(e)}`),
        'error',
      );
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
      notify(tx(lang, 'Escribe un título para el recordatorio.', 'Enter a title for the reminder.'), 'error');
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
    notify(
      tx(
        lang,
        'Recordatorio guardado. Se avisará mientras la app esté abierta.',
        'Reminder saved. It will alert while the app is open.',
      ),
      'success',
    );
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
          new Notification('Better Fitness Tracker', { body: r.title });
        }
        notify(tx(lang, `Recordatorio: ${r.title}`, `Reminder: ${r.title}`), 'info');
      }
    };
    const id = window.setInterval(check, 30_000);
    check();
    return () => window.clearInterval(id);
  }, [reminders, notify, lang]);

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
          <h1 className="page-title">{tx(lang, 'Panel', 'Dashboard')}</h1>
          <p className="page-sub">
            {tx(
              lang,
              'Resumen diario, composición corporal, nutrición y recordatorios en una sola sección.',
              'Daily summary, body composition, nutrition and reminders in one place.',
            )}
          </p>
        </div>
        <div className="page-actions">
          <span className="badge badge-primary">
            <Icon name="calendar" size={12} />{' '}
            {new Date().toLocaleDateString(locale(lang), { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label={tx(lang, 'Secciones del panel', 'Dashboard sections')}>
        {PANEL_TABS.map(([id, es, en]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {tx(lang, es, en)}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="grid grid-4">
          <Stat
            label={tx(lang, 'Peso actual', 'Current weight')}
            value={currentWeight ? `${currentWeight.toFixed(1)} kg` : '—'}
            caption={
              weights.length
                ? tx(lang, `Último registro ${weights[weights.length - 1].date}`, `Last entry ${weights[weights.length - 1].date}`)
                : tx(lang, 'Regístralo en la pestaña Cuerpo', 'Log it in the Body tab')
            }
          />
          <Stat
            label={tx(lang, 'IMC', 'BMI')}
            value={bmi ? bmi.toFixed(1) : '—'}
            caption={
              bmi
                ? bmi < 18.5
                  ? tx(lang, 'Bajo peso', 'Underweight')
                  : bmi < 25
                    ? tx(lang, 'Rango normal', 'Normal range')
                    : bmi < 30
                      ? tx(lang, 'Sobrepeso', 'Overweight')
                      : tx(lang, 'Obesidad', 'Obesity')
                : tx(lang, 'Faltan peso y altura', 'Weight and height required')
            }
          />
          <Stat
            label={tx(lang, '% grasa estimado', 'Estimated body fat %')}
            value={fatAvg !== null ? `${fatAvg.toFixed(1)}%` : '—'}
            caption={
              comp.methods.length
                ? tx(lang, `${comp.methods.length} método(s) disponibles`, `${comp.methods.length} method(s) available`)
                : tx(lang, 'Añade cintura, cuello o edad', 'Add waist, neck or age')
            }
          />
          <Stat
            label={tx(lang, 'Sesiones esta semana', 'Sessions this week')}
            value={exerciseSummary.weekSessions}
            caption={`${minutesLabel(exerciseSummary.weekMinutes)} · ${tx(lang, `${exerciseSummary.weekSets} series`, `${exerciseSummary.weekSets} sets`)}`}
          />
        </div>
      )}

      <div className="grid grid-2">
        {tab === 'summary' && (
          <section
            className={`card water-banner span-2 ${waterOver ? 'water-banner-over' : ''}`}
          aria-label={tx(lang, 'Control de agua', 'Water tracking')}
          aria-live="polite"
        >
          <div className="water-banner-body">
            <div className="water-banner-top">
              <div className="water-banner-icon"><Icon name="water" size={24} /></div>
              <div className="water-banner-copy">
                <div className="water-banner-title">{tx(lang, 'Agua de hoy', "Today's water")}</div>
                <div className="water-banner-sub">{waterGuidance.message}</div>
              </div>
              <div className="water-banner-value">
                <strong>{(waterCurrent / 1000).toFixed(2)} L</strong>
                <span>{tx(lang, 'objetivo', 'target')} {(waterTarget / 1000).toFixed(1)} L</span>
              </div>
              <span className={`badge ${waterOver ? 'badge-error' : waterPct >= 100 ? 'badge-success' : 'badge-primary'}`}>
                {waterOver ? tx(lang, 'Exceso', 'Excess') : `${waterPct}%`}
              </span>
            </div>
            <ProgressBar
              label={tx(lang, 'Progreso de hidratación', 'Hydration progress')}
              valueLabel={tx(
                lang,
                `${waterCurrent} ml · seguro hasta ${waterSafeMax} ml`,
                `${waterCurrent} ml · safe up to ${waterSafeMax} ml`,
              )}
              value={waterCurrent}
              max={Math.max(waterTarget, waterSafeMax)}
              color={waterOver ? 'var(--error)' : 'var(--info)'}
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
              {waterOver && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm water-undo"
                  disabled={waterBusy || waterCurrent === 0}
                  onClick={() => void logWater(-500)}
                >
                  {tx(lang, 'Corregir −500 ml', 'Correct −500 ml')}
                </button>
              )}
            </div>
            <div className={`notice ${waterOver ? 'notice-error' : waterGuidance.tone === 'warn' ? 'notice-warn' : 'notice-info'}`}>
              <Icon name={waterOver ? 'alert' : 'info'} size={16} />
              <div>
                <strong>
                  {tx(lang, 'Rango seguro:', 'Safe range:')} {(waterTarget / 1000).toFixed(1)}–{(waterSafeMax / 1000).toFixed(1)}{' '}
                  {tx(lang, 'L/día', 'L/day')}
                  {' · '}
                  {tx(lang, 'no superar', 'do not exceed')} {(waterGuidance.hardMaxMl / 1000).toFixed(1)} L
                </strong>
                <div className="small">{waterGuidance.detail}</div>
                <div className="small muted">
                  {tx(lang, 'Calculado con ', 'Calculated with ')}
                  {waterGuidance.leanMassKg !== null
                    ? tx(
                        lang,
                        `${waterGuidance.leanMassKg.toFixed(1)} kg de masa magra`,
                        `${waterGuidance.leanMassKg.toFixed(1)} kg of lean mass`,
                      )
                    : tx(lang, 'tu peso', 'your weight')}
                  {waterGuidance.fatMassKg !== null
                    ? tx(
                        lang,
                        ` y ${waterGuidance.fatMassKg.toFixed(1)} kg de grasa`,
                        ` and ${waterGuidance.fatMassKg.toFixed(1)} kg of fat`,
                      )
                    : ''}
                  {' · '}
                  {tx(
                    lang,
                    `${waterGuidance.exerciseAddMl} ml extra por entrenamiento. Se guarda al momento en el log de hoy.`,
                    `${waterGuidance.exerciseAddMl} ml extra per workout. Saved immediately to today's log.`,
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
        )}

        {tab === 'body' && (
        <>
        <section className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="scale" /> {tx(lang, 'Peso y composición', 'Weight and composition')}</div>
              <div className="card-sub">
                {tx(
                  lang,
                  'Registra el peso rápido y, cuando puedas, añade medidas. Más datos = mejor estimación.',
                  'Log weight quickly and, when you can, add measurements. More data = better estimates.',
                )}
              </div>
            </div>
            <div className="badge badge-muted">
              {lastMeas
                ? tx(lang, `Última medida ${lastMeas.date}`, `Last measurement ${lastMeas.date}`)
                : tx(lang, 'Sin medidas', 'No measurements')}
            </div>
          </div>
          <div className="card-body stack">
            <div className="row wrap" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ minWidth: 150 }}>
                <span className="field-label">{tx(lang, 'Fecha de peso', 'Weight date')}</span>
                <input className="input" type="date" value={weightDate} onChange={(e) => setWeightDate(e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 120 }}>
                <span className="field-label">{tx(lang, 'Peso (kg)', 'Weight (kg)')}</span>
                <NumberInput value={weightKg} onChange={setWeightKg} placeholder="75.0" min={20} max={400} step={0.1} />
              </div>
              <button className="btn btn-primary" onClick={saveWeight}>
                <Icon name="plus" size={15} /> {tx(lang, 'Registrar peso', 'Log weight')}
              </button>
              {weights.length > 1 && (
                <div style={{ marginLeft: 'auto', minWidth: 160 }}>
                  <MiniSparkline values={weights.slice(-14).map((w) => w.kg)} />
                </div>
              )}
            </div>

            <div className="divider" />

            <div className="grid grid-4">
              <Field label={tx(lang, 'Fecha', 'Date')}><input className="input" type="date" value={measForm.date} onChange={(e) => changeMeas('date', e.target.value)} /></Field>
              <Field label={tx(lang, 'Sexo', 'Sex')}>
                <Select
                  value={measForm.sex}
                  onChange={(v) => changeBody('sex', v as Sex)}
                  options={[
                    { value: 'unspecified', label: tx(lang, 'Sin especificar', 'Unspecified') },
                    { value: 'male', label: tx(lang, 'Hombre', 'Male') },
                    { value: 'female', label: tx(lang, 'Mujer', 'Female') },
                  ]}
                />
              </Field>
              <Field label={tx(lang, 'Edad', 'Age')}><NumberInput value={measForm.age} onChange={(v) => changeBody('age', v)} placeholder="30" min={10} max={100} /></Field>
              <Field label={tx(lang, 'Altura (cm)', 'Height (cm)')}><NumberInput value={measForm.height} onChange={(v) => changeBody('height', v)} placeholder="175" min={100} max={230} /></Field>
              <Field label={tx(lang, 'Peso composición (kg)', 'Composition weight (kg)')}><NumberInput value={measForm.weight} onChange={(v) => changeBody('weight', v)} placeholder="75" min={20} max={400} step={0.1} /></Field>
              <Field label={tx(lang, 'Cuello (cm)', 'Neck (cm)')}><NumberInput value={measForm.neck} onChange={(v) => changeBody('neck', v)} placeholder="38" min={20} max={70} /></Field>
              <Field label={tx(lang, 'Cintura (cm)', 'Waist (cm)')}><NumberInput value={measForm.waist} onChange={(v) => changeBody('waist', v)} placeholder="85" min={40} max={180} /></Field>
              <Field label={tx(lang, 'Abdomen ombligo (cm)', 'Navel abdomen (cm)')}><NumberInput value={measForm.abdomen} onChange={(v) => changeBody('abdomen', v)} placeholder="85" min={40} max={180} /></Field>
              <Field label={tx(lang, 'Cadera (cm)', 'Hip (cm)')}><NumberInput value={measForm.hip} onChange={(v) => changeBody('hip', v)} placeholder="95" min={40} max={180} /></Field>
            </div>

            <details className="details">
              <summary>{tx(lang, 'Más medidas para la figura corporal', 'More measurements for the body figure')}</summary>
              <div className="grid grid-4" style={{ marginTop: 12 }}>
                <Field label={tx(lang, 'Pecho (cm)', 'Chest (cm)')}><NumberInput value={measForm.chest} onChange={(v) => changeBody('chest', v)} placeholder="100" /></Field>
                <Field label={tx(lang, 'Brazo (cm)', 'Arm (cm)')}><NumberInput value={measForm.arm} onChange={(v) => changeBody('arm', v)} placeholder="32" /></Field>
                <Field label={tx(lang, 'Antebrazo (cm)', 'Forearm (cm)')}><NumberInput value={measForm.forearm} onChange={(v) => changeBody('forearm', v)} placeholder="25" /></Field>
                <Field label={tx(lang, 'Muslo (cm)', 'Thigh (cm)')}><NumberInput value={measForm.thigh} onChange={(v) => changeBody('thigh', v)} placeholder="55" /></Field>
                <Field label={tx(lang, 'Pantorrilla (cm)', 'Calf (cm)')}><NumberInput value={measForm.calf} onChange={(v) => changeBody('calf', v)} placeholder="38" /></Field>
                <Field label={tx(lang, 'Muñeca (cm)', 'Wrist (cm)')}><NumberInput value={measForm.wrist} onChange={(v) => changeBody('wrist', v)} placeholder="17" /></Field>
              </div>
            </details>

            <div className="row between wrap">
              <div className="row wrap">
                <span className="badge badge-muted">{tx(lang, 'IMC', 'BMI')} {comp.bmi ? comp.bmi.toFixed(1) : '—'}</span>
                <span className="badge badge-muted">{tx(lang, '% grasa', '% fat')} {comp.avg !== null ? `${comp.avg.toFixed(1)}%` : '—'}</span>
                <span className="badge badge-muted">{tx(lang, 'Masa magra', 'Lean mass')} {comp.leanMass !== null ? `${comp.leanMass.toFixed(1)} kg` : '—'}</span>
                <span className="badge badge-muted">{tx(lang, 'Cintura/cadera', 'Waist/hip')} {comp.whr !== null ? comp.whr.toFixed(2) : '—'}</span>
              </div>
              <button className="btn btn-tonal" onClick={saveMeasurements}>
                <Icon name="check" size={15} /> {tx(lang, 'Guardar medidas', 'Save measurements')}
              </button>
            </div>
            {comp.missing.length > 0 && (
              <p className="hint">
                {tx(
                  lang,
                  `Para mejorar la estimación faltan: ${comp.missing.join(', ')}. La app usa los métodos disponibles sin exigir todos los datos.`,
                  `Missing for a better estimate: ${comp.missing.join(', ')}. The app uses the available methods without requiring all data.`,
                )}
              </p>
            )}
          </div>
        </section>

        <FatTrend events={events} className="span-2" />

        <section className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="target" /> {tx(lang, 'Rango seguro y proyección', 'Safe range and projection')}</div>
              <div className="card-sub">
                {tx(
                  lang,
                  'Rangos deducidos de tu sexo y edad. El peso objetivo se recalcula con tu composición y la proyección incorpora tus sesiones de fuerza y pasos medios. Son referencias orientativas, no diagnóstico médico.',
                  'Ranges inferred from your sex and age. Target weight is recalculated from composition and the projection factors in your strength sessions and average steps. These are guides, not medical diagnosis.',
                )}
              </div>
            </div>
            <span className={`badge ${projection.safe ? 'badge-success' : 'badge-warning'}`}>
              {projection.safe ? tx(lang, 'Dentro de rango', 'Within range') : tx(lang, 'Revisar objetivo', 'Review goal')}
            </span>
          </div>
          <div className="card-body stack">
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="metric">
                <div className="metric-label">{tx(lang, 'IMC actual', 'Current BMI')}</div>
                <div className="metric-value-lg">{comp.bmi !== null ? comp.bmi.toFixed(1) : '—'}</div>
                <div className="metric-caption">{bmiRange.label} · {bmiStatus.label}</div>
              </div>
              <div className="metric">
                <div className="metric-label">{tx(lang, '% grasa actual', 'Current body fat %')}</div>
                <div className="metric-value-lg">{comp.avg !== null ? `${comp.avg.toFixed(1)}%` : '—'}</div>
                <div className="metric-caption">
                  {fatRange ? fatRange.label : tx(lang, 'Añade sexo para calcular el rango', 'Add sex to calculate the range')} · {classifyValue(comp.avg, fatRange, lang).label}
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">
                  {projection.targetSource === 'composition'
                    ? tx(lang, 'Peso objetivo por composición', 'Composition target weight')
                    : tx(lang, 'Peso objetivo', 'Target weight')}
                </div>
                <div className="metric-value-lg">{projection.targetWeight !== null ? `${projection.targetWeight.toFixed(1)} kg` : '—'}</div>
                <div className="metric-caption">
                  {projection.targetBmi !== null ? tx(lang, `IMC ${projection.targetBmi.toFixed(1)}`, `BMI ${projection.targetBmi.toFixed(1)}`) : tx(lang, 'Faltan datos', 'Missing data')}
                  {projection.targetBodyFat !== null
                    ? tx(lang, ` · ${projection.targetBodyFat.toFixed(0)}% grasa`, ` · ${projection.targetBodyFat.toFixed(0)}% fat`)
                    : ''}
                </div>
                {projection.targetFatMass !== null && projection.targetLeanMass !== null && (
                  <div className="metric-caption">
                    {tx(
                      lang,
                      `${projection.targetLeanMass.toFixed(1)} kg magra · ${projection.targetFatMass.toFixed(1)} kg grasa`,
                      `${projection.targetLeanMass.toFixed(1)} kg lean · ${projection.targetFatMass.toFixed(1)} kg fat`,
                    )}
                  </div>
                )}
              </div>
              <div className="metric">
                <div className="metric-label">{tx(lang, 'Ritmo estimado', 'Estimated rate')}</div>
                <div className="metric-value-lg">
                  {projection.weeklyRateKg > 0
                    ? tx(lang, `${projection.weeklyRateKg.toFixed(2)} kg/sem`, `${projection.weeklyRateKg.toFixed(2)} kg/wk`)
                    : '—'}
                </div>
                <div className="metric-caption">
                  {projection.dailyKcalDelta === 0
                    ? tx(lang, 'Sin déficit ni superávit', 'No deficit or surplus')
                    : tx(
                        lang,
                        `${projection.dailyKcalDelta > 0 ? '+' : ''}${projection.dailyKcalDelta} kcal/día`,
                        `${projection.dailyKcalDelta > 0 ? '+' : ''}${projection.dailyKcalDelta} kcal/day`,
                      )}
                </div>
                <div className="metric-caption">
                  {tx(lang, `Fuerza: ${projection.strengthPerMonth}/mes`, `Strength: ${projection.strengthPerMonth}/mo`)}
                  {' · '}
                  {steps > 0
                    ? tx(lang, `${Math.round(steps)} pasos/día`, `${Math.round(steps)} steps/day`)
                    : tx(lang, 'Pasos: sin dato', 'Steps: no data')}
                </div>
              </div>
            </div>

            <div className={`notice ${projection.safe ? 'notice-info' : 'notice-warn'}`}>
              <Icon name={projection.safe ? 'info' : 'alert'} size={16} />
              <div>
                <strong>{projection.message}</strong>
                {projection.note && <div className="small">{projection.note}</div>}
                {projection.etaDate && (
                  <div className="small">
                    {tx(lang, 'Fecha estimada:', 'Estimated date:')} {formatShort(projection.etaDate, lang)} ·{' '}
                    {tx(lang, `${projection.weeks} semana(s).`, `${projection.weeks} week(s).`)}
                  </div>
                )}
                <div className="small muted">{bmiRange.note} {fatRange?.note ?? ''}</div>
              </div>
            </div>

            {projection.milestones.length > 0 && (
              <div className="projection-track">
                <span className="field-label">{tx(lang, 'Hitos aproximados', 'Approximate milestones')}</span>
                <div className="projection-steps">
                  {projection.milestones.map((milestone) => (
                    <div key={milestone.date} className="projection-step">
                      <strong>{milestone.weight.toFixed(1)} kg</strong>
                      <span className="small muted">{formatShort(milestone.date, lang)}</span>
                      {milestone.bodyFat !== null && (
                        <span className="small">
                          ≈{milestone.bodyFat.toFixed(1)}% {tx(lang, 'grasa', 'fat')}
                        </span>
                      )}
                      {milestone.fatMass !== null && (
                        <span className="small muted">
                          {tx(lang, `${milestone.fatMass.toFixed(1)} kg grasa`, `${milestone.fatMass.toFixed(1)} kg fat`)}
                          {milestone.leanMass !== null
                            ? tx(lang, ` · ${milestone.leanMass.toFixed(1)} kg magra`, ` · ${milestone.leanMass.toFixed(1)} kg lean`)
                            : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="hint">
              {tx(
                lang,
                'El cálculo asume que mantienes el nivel de actividad, la fuerza, los pasos y el balance actual. Una variación de peso de 0,5–1 % por semana al perder grasa y de 0,25–0,5 % al ganar es un ritmo sostenible; con más fuerza se conserva mejor la masa magra.',
                'The calculation assumes you keep your current activity level, strength work, steps and balance. A weight change of 0.5–1% per week when losing fat and 0.25–0.5% when gaining is a sustainable rate; more strength work preserves lean mass better.',
              )}
            </p>
          </div>
        </section>
        </>
        )}

        {tab === 'nutrition' && (
        <>
        <section className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="target" /> {tx(lang, 'Macros y agua', 'Macros and water')}</div>
              <div className="card-sub">
                {tx(
                  lang,
                  'Calculado con tu peso, altura, edad, sexo y minutos de entrenamiento de los últimos 7 días.',
                  'Calculated from your weight, height, age, sex and training minutes over the last 7 days.',
                )}
              </div>
            </div>
          </div>
          <div className="card-body stack">
            <div className="segmented" role="tablist" aria-label={tx(lang, 'Objetivo', 'Goal')}>
              {([
                ['cut', tx(lang, 'Perder grasa', 'Lose fat')],
                ['maintain', tx(lang, 'Mantener', 'Maintain')],
                ['bulk', tx(lang, 'Ganar músculo', 'Gain muscle')],
              ] as Array<[GoalMode, string]>).map(([mode, label]) => (
                <button key={mode} type="button" className={`segment ${goalMode === mode ? 'active' : ''}`} onClick={() => void changeGoal(mode)}>
                  {label}
                </button>
              ))}
            </div>

            <label className="field">
              <span className="field-label">{tx(lang, 'Nivel de actividad física', 'Physical activity level')}</span>
              {/* Selector personalizado: el popup de un <select> nativo se
                  dibuja con el tema del sistema (padding grande y colores que
                  no combinan). El menú propio usa el tema de la app y añade la
                  descripción de cada nivel como texto de apoyo. */}
              <Select
                value={activity}
                onChange={(value) => void changeActivity(value as ActivityLevel)}
                options={[AUTO_ACTIVITY, ...ACTIVITY_LEVELS].map((option) => ({
                  value: option.id,
                  label: `${activityOption(option.id, lang).label} · ${
                    option.multiplier > 0
                      ? `×${option.multiplier}`
                      : tx(lang, 'según entrenamiento', 'based on training')
                  }`,
                  hint: activityOption(option.id, lang).description,
                }))}
              />
              <span className="hint">{activityOption(activity, lang).description}</span>
            </label>

            <div className="field">
              <span className="field-label">{tx(lang, 'Pasos promedio al día', 'Average daily steps')}</span>
              <div className="row">
                <NumberInput
                  value={steps}
                  onChange={setSteps}
                  min={0}
                  max={60000}
                  step={500}
                  className="grow"
                  placeholder={tx(lang, 'Ej. 8000', 'E.g. 8000')}
                  ariaLabel={tx(lang, 'Pasos promedio al día', 'Average daily steps')}
                />
                <button type="button" className="btn btn-tonal" onClick={() => void saveSteps()}>
                  {tx(lang, 'Guardar', 'Save')}
                </button>
              </div>
              <span className="hint">
                {stepActivity !== null
                  ? tx(
                      lang,
                      `Se usa como ×${stepActivity.toFixed(2)} de actividad si supera al nivel elegido. Ajusta el gasto y las fechas de la proyección.`,
                      `Used as an activity multiplier of ×${stepActivity.toFixed(2)} if it exceeds the selected level. It adjusts expenditure and projection dates.`,
                    )
                  : tx(
                      lang,
                      'Opcional. Si lo indicas, el gasto y la proyección se ajustan a tu actividad diaria real.',
                      'Optional. If set, expenditure and projection adjust to your actual daily activity.',
                    )}
              </span>
            </div>

            {macros ? (
              <>
                <div className="grid grid-2" style={{ gap: 10 }}>
                  <Stat label={tx(lang, 'Calorías', 'Calories')} value={`${macros.kcal}`} caption={tx(lang, 'kcal/día', 'kcal/day')} />
                  <Stat label={tx(lang, 'Proteína', 'Protein')} value={`${macros.protein} g`} caption={`${(macros.protein / (baseMeasures.weight || 1)).toFixed(1)} g/kg`} />
                  <Stat label={tx(lang, 'Carbohidratos', 'Carbohydrates')} value={`${macros.carbs} g`} caption={tx(lang, 'energía y glucógeno', 'energy and glycogen')} />
                  <Stat label={tx(lang, 'Grasas', 'Fats')} value={`${macros.fat} g`} caption={tx(lang, 'hormonas y saciedad', 'hormones and satiety')} />
                  <Stat
                    label={tx(lang, 'Gasto estimado', 'Estimated expenditure')}
                    value={`${macros.tdee}`}
                    caption={
                      activity === 'auto'
                        ? `BMR ${macros.bmr} · ${tx(lang, 'actividad', 'activity')} ×${macros.activity.toFixed(3)}`
                        : `BMR ${macros.bmr} · ${activityOption(activity, lang).label} ×${macros.activity.toFixed(3)}`
                    }
                  />
                  <Stat
                    label={tx(lang, 'Balance', 'Balance')}
                    value={`${macros.kcal - macros.tdee > 0 ? '+' : ''}${macros.kcal - macros.tdee} kcal`}
                    caption={`${goalLabel(goalMode, lang)} · ${activityOption(activity, lang).label}`}
                  />
                </div>
                <div className="notice notice-info">
                  <Icon name="water" size={17} />
                  <div>
                    <strong>
                      {tx(lang, 'Agua objetivo:', 'Water target:')} {(waterTarget / 1000).toFixed(1)} L/{tx(lang, 'día', 'day')}
                    </strong>
                    <div className="small">
                      {tx(lang, 'Ajustada a masa magra (', 'Adjusted to lean mass (')}
                      {waterGuidance.leanMassKg !== null
                        ? `${waterGuidance.leanMassKg.toFixed(1)} kg`
                        : tx(lang, 'estimada', 'estimated')}
                      {tx(
                        lang,
                        `) + 500 ml por hora media de entrenamiento. Rango seguro hasta ${(waterSafeMax / 1000).toFixed(1)} L. Fibra objetivo: ${macros.fiber} g/día.`,
                        `) + 500 ml per average training hour. Safe range up to ${(waterSafeMax / 1000).toFixed(1)} L. Fiber target: ${macros.fiber} g/day.`,
                      )}
                    </div>
                  </div>
                </div>
                {macros.missing.length > 0 && (
                  <p className="hint">
                    {tx(lang, 'Estimación adaptativa: faltan ', 'Adaptive estimate: missing ')}
                    {macros.missing.join(', ')}. {macros.notes.join(' ')}
                  </p>
                )}
              </>
            ) : (
              <EmptyState
                icon={<Icon name="scale" />}
                title={tx(lang, 'Falta tu peso', 'Weight required')}
                sub={tx(
                  lang,
                  'Añade tu peso (y altura/edad si puedes) para calcular macros, agua y saciedad.',
                  'Add your weight (and height/age if you can) to calculate macros, water and satiety.',
                )}
              />
            )}
          </div>
        </section>

        <section className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="bowl" /> {tx(lang, 'Ingesta y saciedad', 'Intake and satiety')}</div>
              <div className="card-sub">
                {tx(
                  lang,
                  'Añade alimentos del día, calcula calorías y macros automáticamente y guarda un único log diario. El borrador se borra al terminar el día.',
                  'Add the day\'s foods, calculate calories and macros automatically and save a single daily log. The draft clears at the end of the day.',
                )}
              </div>
            </div>
            <span className={`badge ${savedToday ? 'badge-success' : 'badge-muted'}`}>
              {savedToday ? tx(lang, 'Log de hoy guardado', "Today's log saved") : tx(lang, 'Sin log de hoy', 'No log today')}
            </span>
          </div>
          <div className="card-body stack">
            <FoodLog
              foods={foods}
              items={mealItems}
              onAdd={addMeal}
              onUpdate={updateMeal}
              onRemove={removeMeal}
              onClear={clearMeals}
              onCreateFood={createFood}
            />

            <div className="divider" />

            <div className="row between wrap">
              <span className="badge badge-primary">
                <Icon name="calendar" size={12} /> {tx(lang, 'Hoy', 'Today')} · {day}
              </span>
              <span className="hint">
                {tx(
                  lang,
                  'El log diario se guarda una sola vez por fecha; guardar de nuevo sobrescribe el de hoy.',
                  "The daily log is saved once per date; saving again overwrites today's.",
                )}
              </span>
            </div>

            <div className="grid grid-2" style={{ gap: 10 }}>
              <Field label={tx(lang, 'Agua (ml)', 'Water (ml)')}>
                <NumberInput value={nutri.water} onChange={(v) => changeNutri({ water: v })} placeholder="2500" min={0} max={10000} step={100} />
              </Field>
              <div className="stack-sm">
                <span className="field-label">{tx(lang, 'Totales actuales', 'Current totals')}</span>
                <div className="chips">
                  <span className="chip active">{nutri.kcal} kcal</span>
                  <span className="chip active">{nutri.protein} g {tx(lang, 'proteína', 'protein')}</span>
                  <span className="chip active">{nutri.carbs} g {tx(lang, 'carbohidratos', 'carbs')}</span>
                  <span className="chip active">{nutri.fat} g {tx(lang, 'grasas', 'fat')}</span>
                  <span className="chip active">{nutri.fiber} g {tx(lang, 'fibra', 'fiber')}</span>
                </div>
              </div>
            </div>

            <details className="details">
              <summary>{tx(lang, 'Ajustar macros manualmente (opcional)', 'Adjust macros manually (optional)')}</summary>
              <div className="grid grid-3" style={{ marginTop: 12 }}>
                <Field label={tx(lang, 'Calorías (kcal)', 'Calories (kcal)')}><NumberInput value={nutri.kcal} onChange={(v) => changeNutri({ kcal: v })} placeholder="2200" min={0} max={8000} /></Field>
                <Field label={tx(lang, 'Proteína (g)', 'Protein (g)')}><NumberInput value={nutri.protein} onChange={(v) => changeNutri({ protein: v })} placeholder="135" min={0} max={500} /></Field>
                <Field label={tx(lang, 'Carbohidratos (g)', 'Carbohydrates (g)')}><NumberInput value={nutri.carbs} onChange={(v) => changeNutri({ carbs: v })} placeholder="250" min={0} max={1000} /></Field>
                <Field label={tx(lang, 'Grasas (g)', 'Fats (g)')}><NumberInput value={nutri.fat} onChange={(v) => changeNutri({ fat: v })} placeholder="70" min={0} max={400} /></Field>
                <Field label={tx(lang, 'Fibra (g)', 'Fiber (g)')}><NumberInput value={nutri.fiber} onChange={(v) => changeNutri({ fiber: v })} placeholder="30" min={0} max={150} /></Field>
              </div>
            </details>

            <div className="row between wrap">
              <button className="btn btn-primary" onClick={saveNutrition} disabled={!hasNutrition}>
                <Icon name="check" size={15} />{' '}
                {savedToday
                  ? tx(lang, 'Actualizar ingesta de hoy', "Update today's intake")
                  : tx(lang, 'Guardar ingesta de hoy', "Save today's intake")}
              </button>
              {macros && (
                <span className="hint">
                  {tx(lang, 'Objetivo:', 'Target:')} {macros.kcal} kcal · {macros.protein} g{' '}
                  {tx(lang, 'proteína', 'protein')} · {(waterTarget / 1000).toFixed(1)} L{' '}
                  {tx(lang, 'de agua', 'of water')}
                </span>
              )}
            </div>

            {!macros ? (
              <p className="hint">
                {tx(lang, 'Añade tu peso para comparar la ingesta con tus objetivos.', 'Add your weight to compare intake with your targets.')}
              </p>
            ) : !hasNutrition ? (
              <div className="notice notice-info">
                <Icon name="info" size={16} />
                <span>
                  {tx(
                    lang,
                    'Añade comidas o agua para estimar la saciedad con proteína, fibra, volumen, densidad energética e hidratación.',
                    'Add meals or water to estimate satiety from protein, fiber, volume, energy density and hydration.',
                  )}
                </span>
              </div>
            ) : satiety && (
              <div className="stack">
                <ProgressBar
                  label={tx(lang, 'Índice de saciedad', 'Satiety index')}
                  valueLabel={`${satiety.score}%`}
                  value={satiety.score}
                  color={satiety.tone === 'good' ? 'var(--success)' : satiety.tone === 'bad' ? 'var(--error)' : 'var(--tertiary)'}
                />
                <div className="satiety-drivers">
                  {satiety.drivers.map((driver) => (
                    <ProgressBar
                      key={driver.id}
                      label={`${driver.label} · ${driver.weight}%`}
                      valueLabel={`${driver.value}%`}
                      value={driver.value}
                      color={driver.value >= 70 ? 'var(--success)' : driver.value < 45 ? 'var(--error)' : 'var(--info)'}
                    />
                  ))}
                </div>
                <div className="chips">
                  <span className="chip active">
                    {satiety.mealGrams} g {tx(lang, 'de comida', 'of food')}
                  </span>
                  {satiety.energyDensity !== null && (
                    <span className="chip active">{satiety.energyDensity.toFixed(2)} kcal/g</span>
                  )}
                  <span className="chip">{tx(lang, 'Distensión', 'Fullness')} {satiety.fullness}%</span>
                  <span className="chip">{tx(lang, 'Señal hormonal', 'Hormonal signal')} {satiety.hormonal}%</span>
                  <span className="chip">{tx(lang, 'Hidratación', 'Hydration')} {satiety.hydration}%</span>
                </div>
                <div className={`notice ${satiety.tone === 'good' ? 'notice-success' : satiety.tone === 'bad' ? 'notice-error' : satiety.tone === 'warn' ? 'notice-warn' : 'notice-info'}`}>
                  <Icon name={satiety.tone === 'good' ? 'check' : satiety.tone === 'info' ? 'info' : 'alert'} size={17} />
                  <div>
                    <strong>{satiety.diagnosis}</strong>
                    <div className="small">{satiety.tip}</div>
                  </div>
                </div>
                <details className="details">
                  <summary>{tx(lang, 'Cómo se calcula la saciedad', 'How satiety is calculated')}</summary>
                  <div className="stack-sm" style={{ marginTop: 10 }}>
                    {satiety.drivers.map((driver) => (
                      <div key={driver.id} className="satiety-driver-detail">
                        <strong>{driver.label}</strong>
                        <span className="small muted"> {driver.detail}</span>
                      </div>
                    ))}
                    <p className="hint">
                      {tx(
                        lang,
                        'El índice pondera proteína (30 %), peso/volumen (25 %), fibra (20 %), agua (10 %), densidad energética (10 %) y grasa (5 %). Se ajusta por masa magra, % de grasa y minutos de entrenamiento semanales. No es una medida clínica de hambre.',
                        'The index weights protein (30%), weight/volume (25%), fiber (20%), water (10%), energy density (10%) and fat (5%). It adjusts for lean mass, body fat % and weekly training minutes. It is not a clinical measure of hunger.',
                      )}
                    </p>
                  </div>
                </details>
              </div>
            )}
          </div>
        </section>

        <section className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="bowl" /> {tx(lang, 'Recetas recomendadas', 'Recommended recipes')}</div>
              <div className="card-sub">
                {goalLabel(goalMode, lang)} ·{' '}
                {tx(
                  lang,
                  'elige una receta y añade sus ingredientes al diario con los mismos macros de la base de alimentos.',
                  'choose a recipe and add its ingredients to the diary with the same macros from the food database.',
                )}
              </div>
            </div>
            <span className="badge badge-muted">{tx(lang, 'Basado en evidencia', 'Evidence-based')}</span>
          </div>
          <div className="card-body stack">
            <div className="recipe-grid">
              {recipeSuggestions.map((recipe) => (
                <article key={recipe.id} className="recipe-card">
                  <div className="row between wrap">
                    <strong>{recipe.name}</strong>
                    <span className={`badge ${recipe.fit === 'excellent' ? 'badge-success' : recipe.fit === 'good' ? 'badge-primary' : 'badge-muted'}`}>
                      {recipe.fit === 'excellent'
                        ? tx(lang, 'Encaje alto', 'High fit')
                        : recipe.fit === 'good'
                          ? tx(lang, 'Buen encaje', 'Good fit')
                          : tx(lang, 'Alternativa', 'Alternative')}
                    </span>
                  </div>
                  <p className="small muted">{recipe.description}</p>
                  <div className="chips">
                    <span className="chip active">{recipe.macros.kcal} kcal</span>
                    <span className="chip active">{recipe.macros.protein} g {tx(lang, 'proteína', 'protein')}</span>
                    <span className="chip">{recipe.macros.carbs} g {tx(lang, 'carbos', 'carbs')}</span>
                    <span className="chip">{recipe.macros.fat} g {tx(lang, 'grasa', 'fat')}</span>
                    <span className="chip">{recipe.macros.fiber} g {tx(lang, 'fibra', 'fiber')}</span>
                  </div>
                  <p className="hint small">
                    <strong>{tx(lang, 'Por qué:', 'Why:')}</strong> {recipe.science}
                  </p>
                  <div className="row between wrap">
                    <span className="hint small">
                      {recipe.minutes} min · {mealSlotLabel(recipe.meal, lang)} · {recipe.macros.grams} g
                    </span>
                    <button className="btn btn-tonal btn-sm" onClick={() => addRecipe(recipe)}>
                      <Icon name="plus" size={14} /> {tx(lang, 'Añadir al diario', 'Add to diary')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <p className="hint">
              {tx(
                lang,
                'En déficit se prioriza proteína y fibra por caloría; en superávit, densidad energética y carbohidratos alrededor del entrenamiento. Ajusta las porciones a tu hambre y a tus objetivos.',
                'In a deficit, protein and fiber per calorie come first; in a surplus, energy density and carbs around training. Adjust portions to your hunger and goals.',
              )}
            </p>
          </div>
        </section>
        </>
        )}

        {tab === 'summary' && (
        <>
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="dumbbell" /> {tx(lang, 'Entrenamiento', 'Training')}</div>
              <div className="card-sub">
                {tx(lang, 'Resumen de los últimos 7 días y mapa de calor muscular.', 'Summary of the last 7 days and muscle heatmap.')}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('training')}>
              {tx(lang, 'Ver todo', 'View all')} <Icon name="chevron" size={14} />
            </button>
          </div>
          <div className="card-body">
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="stack-sm">
                <Stat label={tx(lang, 'Sesiones', 'Sessions')} value={exerciseSummary.weekSessions} caption={minutesLabel(exerciseSummary.weekMinutes)} />
                <Stat
                  label={tx(lang, 'Series', 'Sets')}
                  value={exerciseSummary.weekSets}
                  caption={tx(
                    lang,
                    `${Math.round(exerciseSummary.weekVolume).toLocaleString('es')} kg de volumen`,
                    `${Math.round(exerciseSummary.weekVolume).toLocaleString('en')} kg of volume`,
                  )}
                />
              </div>
              <BodyHeatmap load={zoneLoad} compact />
            </div>
            <div className="row between" style={{ marginTop: 12 }}>
              <span className="hint">
                {topZone
                  ? tx(lang, `Zona más cargada: ${zoneName(topZone, lang)}`, `Most loaded zone: ${zoneName(topZone, lang)}`)
                  : tx(lang, 'Sin datos de zonas todavía.', 'No zone data yet.')}
              </span>
              {alerts.length > 0 ? (
                <span className="badge badge-warning">
                  <Icon name="alert" size={12} /> {tx(lang, `${alerts.length} alerta(s)`, `${alerts.length} alert(s)`)}
                </span>
              ) : (
                <span className="badge badge-success"><Icon name="check" size={12} /> {tx(lang, 'Carga equilibrada', 'Balanced load')}</span>
              )}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="alert" /> {tx(lang, 'Alertas de sobreentrenamiento', 'Overtraining alerts')}</div>
              <div className="card-sub">
                {tx(
                  lang,
                  'Compara series y minutos por zona con rangos semanales recomendados.',
                  'Compare sets and minutes per zone against recommended weekly ranges.',
                )}
              </div>
            </div>
          </div>
          <div className="card-body stack">
            {alerts.length === 0 ? (
              <div className="notice notice-success">
                <Icon name="check" size={17} />
                <div>
                  <strong>{tx(lang, 'Sin señales de sobreentrenamiento', 'No signs of overtraining')}</strong>
                  <div className="small">
                    {tx(
                      lang,
                      'Las zonas entrenadas esta semana están dentro de rangos razonables.',
                      'The zones trained this week are within reasonable ranges.',
                    )}
                  </div>
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
            {alerts.length > 5 && (
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('training')}>
                {tx(lang, 'Ver todas', 'View all')}
              </button>
            )}
          </div>
        </section>
        </>
        )}

        {tab === 'reminders' && (
        <section className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="clock" /> {tx(lang, 'Recordatorios', 'Reminders')}</div>
              <div className="card-sub">
                {tx(lang, 'Avisos locales mientras la app está abierta.', 'Local alerts while the app is open.')}
              </div>
            </div>
          </div>
          <div className="card-body stack">
            <div className="grid grid-2" style={{ gap: 10 }}>
              <Field label={tx(lang, 'Título', 'Title')}>
                <input
                  className="input"
                  value={remTitle}
                  onChange={(e) => setRemTitle(e.target.value)}
                  placeholder={tx(lang, 'Tomar agua', 'Drink water')}
                />
              </Field>
              <Field label={tx(lang, 'Hora', 'Time')}><input className="input" type="time" value={remTime} onChange={(e) => setRemTime(e.target.value)} /></Field>
            </div>
            <div className="chips">
              {dayNames(lang).map((d, i) => (
                <button key={d} type="button" className={`chip ${remDays.includes(i) ? 'active' : ''}`} onClick={() => toggleRemDay(i)}>{d}</button>
              ))}
            </div>
            <button className="btn btn-tonal btn-sm" onClick={saveReminder}>
              <Icon name="plus" size={14} /> {tx(lang, 'Añadir recordatorio', 'Add reminder')}
            </button>
            {reminders.length === 0 ? (
              <p className="hint">{tx(lang, 'Sin recordatorios.', 'No reminders.')}</p>
            ) : (
              <div className="list">
                {reminders.map((r) => (
                  <div key={r.id} className="list-item">
                    <div className="list-item-main">
                      <span className="list-item-title">{r.title}</span>
                      <span className="list-item-sub">
                        {r.time} · {r.days.map((d) => dayNames(lang)[d]).join(', ')}
                      </span>
                    </div>
                    <button
                      className="btn-icon"
                      aria-label={tx(lang, `Eliminar ${r.title}`, `Delete ${r.title}`)}
                      onClick={() => void deleteReminder(r.id)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        )}
      </div>

      <div className="row between wrap">
        <span className="hint">
          {tx(
            lang,
            'Los cálculos son estimaciones orientativas, no consejo médico. Fórmulas: Navy, RFM, Deurenberg, CUN-BAE, Mifflin-St Jeor, Katch-McArdle y Cunningham.',
            'Calculations are estimates, not medical advice. Formulas: Navy, RFM, Deurenberg, CUN-BAE, Mifflin-St Jeor, Katch-McArdle and Cunningham.',
          )}
        </span>
        <span className="hint">
          {tx(
            lang,
            `${events.length} eventos · ${fmtDuration(exerciseSummary.weekMinutes * 60)} de entrenamiento semanal`,
            `${events.length} events · ${fmtDuration(exerciseSummary.weekMinutes * 60)} of weekly training`,
          )}
        </span>
      </div>
    </div>
  );
}
