import React, { useEffect, useMemo, useState } from 'react';
import type { Habit, HabitFrequency, MoodScore, VaultEvent } from './types';
import { appendEvent, newEvent } from './vault';
import {
  MOOD_FACES,
  autoSummary,
  defaultHabits,
  habitDone,
  habitScheduleLabel,
  isHabitDue,
  reduceHabitLogs,
  sanitizeSummary,
  summaryWordCount,
  weeklyTarget,
  wellnessDigest,
} from './wellness';
import { Stat } from './components/Fields';
import { Icon } from './components/Icons';
import { ProgressBar } from './components/Charts';
import { formatShort, todayISO } from './metrics';

interface Props {
  deviceId: string;
  events: VaultEvent[];
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface HabitForm {
  id: string | null;
  name: string;
  note: string;
  frequency: HabitFrequency;
  days: number[];
  timesPerWeek: number;
  dayOfMonth: number;
  points: number;
}

const EMPTY_FORM: HabitForm = {
  id: null,
  name: '',
  note: '',
  frequency: 'daily',
  days: [],
  timesPerWeek: 3,
  dayOfMonth: 1,
  points: 10,
};

export default function WellnessView({ deviceId, events, onRefresh, notify }: Props) {
  const digest = useMemo(() => wellnessDigest(events), [events]);
  const logs = useMemo(() => reduceHabitLogs(events), [events]);
  const [form, setForm] = useState<HabitForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<MoodScore>(digest.moodToday?.mood ?? 4);
  const [moodNote, setMoodNote] = useState(digest.moodToday?.note ?? '');
  const [summary, setSummary] = useState(digest.moodToday?.summary ?? '');
  const [summaryTouched, setSummaryTouched] = useState(Boolean(digest.moodToday?.summary));
  const today = todayISO();

  useEffect(() => {
    setMood(digest.moodToday?.mood ?? 4);
    setMoodNote(digest.moodToday?.note ?? '');
    setSummary(digest.moodToday?.summary ?? '');
    setSummaryTouched(Boolean(digest.moodToday?.summary));
  }, [digest.moodToday?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestedSummary = autoSummary(
    digest.doneToday,
    digest.dueToday,
    digest.moodToday?.mood ?? mood,
  );

  const updateForm = <K extends keyof HabitForm>(key: K, value: HabitForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleDay = (day: number) => {
    setForm((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((value) => value !== day)
        : [...current.days, day].sort(),
    }));
  };

  const resetForm = () => setForm(EMPTY_FORM);

  const editHabit = (habit: Habit) => {
    setForm({
      id: habit.id,
      name: habit.name,
      note: habit.note ?? '',
      frequency: habit.frequency,
      days: [...habit.days],
      timesPerWeek: habit.timesPerWeek,
      dayOfMonth: habit.dayOfMonth,
      points: habit.points,
    });
  };

  const saveHabit = async () => {
    if (!form.name.trim()) {
      notify('Escribe un nombre para el hábito.', 'error');
      return;
    }
    if (form.frequency === 'weekly' && form.days.length === 0 && form.timesPerWeek < 1) {
      notify('Elige al menos un día o una frecuencia semanal.', 'error');
      return;
    }
    setBusy(true);
    try {
      const existing = events.find(
        (event) => event.kind === 'habit.saved' && (event.payload as Habit | null)?.id === form.id,
      );
      const createdAt =
        (existing?.payload as Habit | null)?.createdAt ?? new Date().toISOString();
      const habit: Habit = {
        id: form.id ?? `habit-${crypto.randomUUID()}`,
        name: form.name.trim(),
        note: form.note.trim(),
        frequency: form.frequency,
        days: form.frequency === 'weekly' ? form.days : [],
        timesPerWeek: form.frequency === 'weekly' && form.days.length === 0 ? form.timesPerWeek : form.days.length || 1,
        dayOfMonth: form.dayOfMonth,
        points: Math.max(1, Math.round(form.points)),
        enabled: true,
        createdAt,
      };
      await appendEvent(newEvent(deviceId, 'habit.saved', habit));
      await onRefresh();
      notify(form.id ? 'Hábito actualizado.' : 'Hábito creado.', 'success');
      resetForm();
    } catch (error) {
      notify(`No se pudo guardar el hábito: ${String(error)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleHabit = async (habit: Habit) => {
    const done = habitDone(habit, logs, today);
    await appendEvent(
      newEvent(deviceId, 'habit.logged', {
        habitId: habit.id,
        date: today,
        completed: !done,
        points: done ? 0 : habit.points,
      }),
    );
    await onRefresh();
    if (!done) notify(`+${habit.points} puntos · ${habit.name}`, 'success');
  };

  const removeHabit = async (habit: Habit) => {
    await appendEvent(newEvent(deviceId, 'habit.deleted', { id: habit.id }));
    await onRefresh();
    if (form.id === habit.id) resetForm();
    notify(`Hábito "${habit.name}" eliminado. Los puntos ya ganados se conservan.`, 'info');
  };

  const toggleEnabled = async (habit: Habit) => {
    await appendEvent(newEvent(deviceId, 'habit.saved', { ...habit, enabled: !habit.enabled }));
    await onRefresh();
  };

  const saveMood = async () => {
    const clean = sanitizeSummary(summary || suggestedSummary);
    setBusy(true);
    try {
      await appendEvent(
        newEvent(deviceId, 'mood.logged', {
          date: today,
          mood,
          note: moodNote.trim(),
          summary: clean,
        }),
      );
      setSummary(clean);
      setSummaryTouched(true);
      await onRefresh();
      notify('Ánimo y resumen del día guardados.', 'success');
    } catch (error) {
      notify(`No se pudo guardar el ánimo: ${String(error)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const useSuggestion = () => {
    setSummary(suggestedSummary);
    setSummaryTouched(true);
  };

  const loadDefaults = async () => {
    setBusy(true);
    try {
      for (const habit of defaultHabits()) {
        await appendEvent(newEvent(deviceId, 'habit.saved', habit));
      }
      await onRefresh();
      notify('Hábitos de ejemplo añadidos. Puedes editarlos o eliminarlos.', 'success');
    } finally {
      setBusy(false);
    }
  };

  const wordCount = summaryWordCount(summary);
  const weekMax = Math.max(1, ...digest.week.map((day) => day.points));
  const moodLabel = MOOD_FACES.find((face) => face.value === digest.moodToday?.mood)?.label;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Hábitos y ánimo</h1>
          <p className="page-sub">
            Rutinas diarias, semanales o mensuales con puntos por cumplirlas y un registro breve de cómo te sientes.
            El resumen del día se guarda en cinco palabras como máximo.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-tonal" onClick={loadDefaults} disabled={busy || digest.habits.length > 0}>
            <Icon name="plus" size={15} /> Hábitos de ejemplo
          </button>
        </div>
      </header>

      <div className="grid grid-4">
        <Stat
          label="Puntos hoy"
          value={digest.pointsToday}
          caption={`${digest.doneToday}/${digest.dueToday} hábitos de hoy`}
        />
        <Stat label="Puntos esta semana" value={digest.pointsWeek} caption={`${digest.pointsMonth} este mes`} />
        <Stat
          label="Racha"
          value={`${digest.streak} día${digest.streak === 1 ? '' : 's'}`}
          caption={`Mejor racha: ${digest.bestStreak}`}
        />
        <Stat
          label="Ánimo 7 días"
          value={digest.moodAverage7 !== null ? digest.moodAverage7.toFixed(1) : '—'}
          caption={
            digest.moodTrend === null
              ? moodLabel ?? 'Sin registros suficientes'
              : `${digest.moodTrend >= 0 ? '+' : ''}${digest.moodTrend.toFixed(1)} vs semana anterior`
          }
        />
      </div>

      <div className="grid grid-2">
        <section className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="check" /> Hábitos de hoy</div>
              <div className="card-sub">
                {digest.dueToday === 0
                  ? 'Hoy no toca ningún hábito. Puedes añadir uno nuevo abajo.'
                  : `Cumple los hábitos programados para sumar puntos. ${digest.doneToday} de ${digest.dueToday} completados.`}
              </div>
            </div>
            <ProgressBar
              label="Progreso diario"
              valueLabel={`${digest.dueToday ? Math.round((digest.doneToday / digest.dueToday) * 100) : 100}%`}
              value={digest.doneToday}
              max={Math.max(1, digest.dueToday)}
            />
          </div>
          <div className="card-body stack">
            {digest.habits.length === 0 ? (
              <div className="notice notice-info">
                <Icon name="info" size={16} />
                <span>
                  Todavía no hay hábitos. Crea uno con el formulario de abajo o carga los ejemplos para empezar en
                  diez segundos.
                </span>
              </div>
            ) : (
              <div className="list">
                {digest.habits.map((habit) => {
                  const due = isHabitDue(habit, today);
                  const done = habitDone(habit, logs, today);
                  const weekDone = digest.week.filter((day) => habitDone(habit, logs, day.date)).length;
                  return (
                    <div key={habit.id} className={`habit-row ${done ? 'habit-done' : ''} ${!habit.enabled ? 'habit-off' : ''}`}>
                      <button
                        type="button"
                        className={`habit-check ${done ? 'active' : ''}`}
                        aria-label={done ? `Desmarcar ${habit.name}` : `Completar ${habit.name}`}
                        onClick={() => void toggleHabit(habit)}
                        disabled={!habit.enabled}
                      >
                        {done ? '✓' : ''}
                      </button>
                      <div className="habit-main">
                        <div className="habit-title">
                          {habit.name}
                          {!habit.enabled && <span className="badge badge-muted">Pausado</span>}
                          {due && !done && <span className="badge badge-primary">Hoy</span>}
                        </div>
                        <div className="habit-sub">
                          {habitScheduleLabel(habit)} · {habit.points} pts
                          {habit.frequency !== 'daily' && ` · ${weekDone}/${weeklyTarget(habit)} esta semana`}
                        </div>
                        {habit.note && <div className="hint small">{habit.note}</div>}
                      </div>
                      <div className="habit-actions">
                        <button className="btn-icon" aria-label={`Editar ${habit.name}`} onClick={() => editHabit(habit)}>
                          <Icon name="settings" size={15} />
                        </button>
                        <button
                          className="btn-icon"
                          aria-label={habit.enabled ? `Pausar ${habit.name}` : `Activar ${habit.name}`}
                          onClick={() => void toggleEnabled(habit)}
                        >
                          <Icon name={habit.enabled ? 'clock' : 'check'} size={15} />
                        </button>
                        <button className="btn-icon" aria-label={`Eliminar ${habit.name}`} onClick={() => void removeHabit(habit)}>
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="divider" />

            <div className="stack-sm">
              <div className="row between wrap">
                <span className="field-label">{form.id ? 'Editar hábito' : 'Nuevo hábito'}</span>
                {form.id && (
                  <button className="btn btn-ghost btn-sm" onClick={resetForm}>
                    Cancelar edición
                  </button>
                )}
              </div>
              <div className="grid grid-3">
                <label className="field">
                  <span className="field-label">Nombre</span>
                  <input
                    className="input"
                    value={form.name}
                    maxLength={80}
                    onChange={(event) => updateForm('name', event.target.value)}
                    placeholder="Caminar 20 minutos"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Frecuencia</span>
                  <select
                    className="select"
                    value={form.frequency}
                    onChange={(event) => updateForm('frequency', event.target.value as HabitFrequency)}
                  >
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Puntos</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={100}
                    value={form.points}
                    onChange={(event) => updateForm('points', Number(event.target.value) || 1)}
                  />
                </label>
              </div>

              {form.frequency === 'weekly' && (
                <div className="stack-sm">
                  <span className="field-label">Días de la semana (opcional)</span>
                  <div className="chips">
                    {DAY_NAMES.map((day, index) => (
                      <button
                        key={day}
                        type="button"
                        className={`chip ${form.days.includes(index) ? 'active' : ''}`}
                        onClick={() => toggleDay(index)}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  {form.days.length === 0 && (
                    <label className="field" style={{ maxWidth: 220 }}>
                      <span className="field-label">Veces por semana</span>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={7}
                        value={form.timesPerWeek}
                        onChange={(event) => updateForm('timesPerWeek', Number(event.target.value) || 1)}
                      />
                    </label>
                  )}
                </div>
              )}

              {form.frequency === 'monthly' && (
                <label className="field" style={{ maxWidth: 220 }}>
                  <span className="field-label">Día del mes</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={31}
                    value={form.dayOfMonth}
                    onChange={(event) => updateForm('dayOfMonth', Number(event.target.value) || 1)}
                  />
                </label>
              )}

              <label className="field">
                <span className="field-label">Nota (opcional)</span>
                <input
                  className="input"
                  value={form.note}
                  maxLength={160}
                  onChange={(event) => updateForm('note', event.target.value)}
                  placeholder="Por qué te importa este hábito"
                />
              </label>
              <button className="btn btn-primary" onClick={saveHabit} disabled={busy}>
                <Icon name="check" size={15} /> {form.id ? 'Guardar cambios' : 'Añadir hábito'}
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="spark" /> Ánimo de hoy</div>
              <div className="card-sub">Un registro rápido ayuda a detectar semanas de baja energía antes de que afecten al entrenamiento.</div>
            </div>
            <span className={`badge ${digest.moodToday ? 'badge-success' : 'badge-muted'}`}>
              {digest.moodToday ? 'Registrado' : 'Sin registrar'}
            </span>
          </div>
          <div className="card-body stack">
            <div className="mood-row">
              {MOOD_FACES.map((face) => (
                <button
                  key={face.value}
                  type="button"
                  className={`mood-face ${mood === face.value ? 'active' : ''}`}
                  onClick={() => setMood(face.value)}
                  aria-label={face.label}
                  title={face.label}
                >
                  <span aria-hidden="true">{face.face}</span>
                  <small>{face.label}</small>
                </button>
              ))}
            </div>
            <label className="field">
              <span className="field-label">Resumen del día · máximo 5 palabras</span>
              <input
                className="input"
                value={summary}
                maxLength={60}
                onChange={(event) => {
                  setSummary(sanitizeSummary(event.target.value));
                  setSummaryTouched(true);
                }}
                placeholder={suggestedSummary}
              />
              <span className={`hint ${wordCount > 5 ? 'text-error' : ''}`}>
                {wordCount}/5 palabras
                {!summaryTouched && ` · Sugerencia: “${suggestedSummary}”`}
              </span>
            </label>
            <div className="row wrap">
              <button className="btn btn-ghost btn-sm" onClick={useSuggestion}>
                Usar sugerencia
              </button>
              <span className="hint">La sugerencia se genera con tus hábitos y el ánimo elegido.</span>
            </div>
            <label className="field">
              <span className="field-label">Nota (opcional)</span>
              <textarea
                className="input textarea"
                rows={3}
                value={moodNote}
                maxLength={400}
                onChange={(event) => setMoodNote(event.target.value)}
                placeholder="Dormí mal, pero el entrenamiento salió bien…"
              />
            </label>
            <button className="btn btn-primary" onClick={saveMood} disabled={busy}>
              <Icon name="check" size={15} /> Guardar ánimo y resumen
            </button>
            {digest.moodToday?.summary && (
              <div className="notice notice-success">
                <Icon name="check" size={16} />
                <div>
                  <strong>Resumen de hoy: “{digest.moodToday.summary}”</strong>
                  <div className="small">
                    {MOOD_FACES.find((face) => face.value === digest.moodToday?.mood)?.label}
                    {digest.moodToday.note ? ` · ${digest.moodToday.note}` : ''}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="calendar" /> Semana</div>
              <div className="card-sub">Puntos, hábitos completados y ánimo de los últimos siete días.</div>
            </div>
          </div>
          <div className="card-body stack">
            {digest.week.map((day) => (
              <div key={day.date} className="wellness-day">
                <span className="wellness-day-label">{day.label}</span>
                <div className="wellness-day-bar">
                  <div style={{ width: `${Math.round((day.points / weekMax) * 100)}%` }} />
                </div>
                <span className="hint small">
                  {day.points} pts · {day.done}/{day.due}
                  {day.mood ? ` · ${MOOD_FACES.find((face) => face.value === day.mood)?.face}` : ''}
                </span>
              </div>
            ))}
            {digest.summaries.length > 0 && (
              <>
                <div className="divider" />
                <span className="field-label">Últimos resúmenes</span>
                <div className="list">
                  {digest.summaries.slice(0, 7).map((entry) => (
                    <div key={entry.date} className="list-item">
                      <div className="list-item-main">
                        <span className="list-item-title">
                          {entry.summary || 'Sin resumen'} <span className="hint">· {formatShort(entry.date)}</span>
                        </span>
                        {entry.note && <span className="list-item-sub">{entry.note}</span>}
                      </div>
                      <span className="badge badge-muted">
                        {MOOD_FACES.find((face) => face.value === entry.mood)?.face ?? '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <p className="hint">
        Los puntos son una herramienta de adherencia, no una medida clínica. Si el ánimo baja de forma persistente,
        habla con un profesional. Todo se guarda solo en tu bóveda local.
      </p>
    </div>
  );
}
