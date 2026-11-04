import React, { useEffect, useMemo, useState } from 'react';
import type { Habit, HabitFrequency, MoodScore, VaultEvent } from './types';
import { appendEvent, newEvent } from './vault';
import {
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
  moodFaces,
} from './wellness';
import { Stat } from './components/Fields';
import Select from './components/Select';
import { Icon } from './components/Icons';
import { ProgressBar } from './components/Charts';
import { formatShort, todayISO } from './metrics';
import { tx, useLanguage } from './i18n';

interface Props {
  deviceId: string;
  events: VaultEvent[];
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

const DAY_NAMES_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  const { lang } = useLanguage();
  const digest = useMemo(() => wellnessDigest(events, new Date(), lang), [events, lang]);
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
    lang,
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
      notify(tx(lang, 'Escribe un nombre para el hábito.', 'Enter a name for the habit.'), 'error');
      return;
    }
    if (form.frequency === 'weekly' && form.days.length === 0 && form.timesPerWeek < 1) {
      notify(tx(lang, 'Elige al menos un día o una frecuencia semanal.', 'Choose at least one day or a weekly frequency.'), 'error');
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
      notify(form.id ? tx(lang, 'Hábito actualizado.', 'Habit updated.') : tx(lang, 'Hábito creado.', 'Habit created.'), 'success');
      resetForm();
    } catch (error) {
      notify(tx(lang, `No se pudo guardar el hábito: ${String(error)}`, `Could not save the habit: ${String(error)}`), 'error');
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
    if (!done) notify(tx(lang, `+${habit.points} puntos · ${habit.name}`, `+${habit.points} points · ${habit.name}`), 'success');
  };

  const removeHabit = async (habit: Habit) => {
    await appendEvent(newEvent(deviceId, 'habit.deleted', { id: habit.id }));
    await onRefresh();
    if (form.id === habit.id) resetForm();
    notify(tx(lang, `Hábito "${habit.name}" eliminado. Los puntos ya ganados se conservan.`, `Habit "${habit.name}" deleted. Points already earned are kept.`), 'info');
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
      notify(tx(lang, 'Ánimo y resumen del día guardados.', 'Mood and day summary saved.'), 'success');
    } catch (error) {
      notify(tx(lang, `No se pudo guardar el ánimo: ${String(error)}`, `Could not save the mood: ${String(error)}`), 'error');
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
      for (const habit of defaultHabits(undefined, lang)) {
        await appendEvent(newEvent(deviceId, 'habit.saved', habit));
      }
      await onRefresh();
      notify(tx(lang, 'Hábitos de ejemplo añadidos. Puedes editarlos o eliminarlos.', 'Example habits added. You can edit or delete them.'), 'success');
    } finally {
      setBusy(false);
    }
  };

  const wordCount = summaryWordCount(summary);
  const weekMax = Math.max(1, ...digest.week.map((day) => day.points));
  const faces = moodFaces(lang);
  const moodLabel = faces.find((face) => face.value === digest.moodToday?.mood)?.label;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{tx(lang, 'Hábitos y ánimo', 'Habits and mood')}</h1>
          <p className="page-sub">
            {tx(
              lang,
              'Rutinas diarias, semanales o mensuales con puntos por cumplirlas y un registro breve de cómo te sientes. El resumen del día se guarda en cinco palabras como máximo.',
              'Daily, weekly or monthly routines with points for completing them, plus a short record of how you feel. The day summary is saved in five words at most.',
            )}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-tonal" onClick={loadDefaults} disabled={busy || digest.habits.length > 0}>
            <Icon name="plus" size={15} /> {tx(lang, 'Hábitos de ejemplo', 'Example habits')}
          </button>
        </div>
      </header>

      <div className="grid grid-4">
        <Stat
          label={tx(lang, 'Puntos hoy', 'Points today')}
          value={digest.pointsToday}
          caption={tx(lang, `${digest.doneToday}/${digest.dueToday} hábitos de hoy`, `${digest.doneToday}/${digest.dueToday} habits today`)}
        />
        <Stat label={tx(lang, 'Puntos esta semana', 'Points this week')} value={digest.pointsWeek} caption={tx(lang, `${digest.pointsMonth} este mes`, `${digest.pointsMonth} this month`)} />
        <Stat
          label={tx(lang, 'Racha', 'Streak')}
          value={tx(lang, `${digest.streak} día${digest.streak === 1 ? '' : 's'}`, `${digest.streak} day${digest.streak === 1 ? '' : 's'}`)}
          caption={tx(lang, `Mejor racha: ${digest.bestStreak}`, `Best streak: ${digest.bestStreak}`)}
        />
        <Stat
          label={tx(lang, 'Ánimo 7 días', 'Mood, 7 days')}
          value={digest.moodAverage7 !== null ? digest.moodAverage7.toFixed(1) : '—'}
          caption={
            digest.moodTrend === null
              ? moodLabel ?? tx(lang, 'Sin registros suficientes', 'Not enough records')
              : tx(lang, `${digest.moodTrend >= 0 ? '+' : ''}${digest.moodTrend.toFixed(1)} vs semana anterior`, `${digest.moodTrend >= 0 ? '+' : ''}${digest.moodTrend.toFixed(1)} vs last week`)
          }
        />
      </div>

      <div className="grid grid-2">
        <section className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="check" /> {tx(lang, 'Hábitos de hoy', "Today's habits")}</div>
              <div className="card-sub">
                {digest.dueToday === 0
                  ? tx(lang, 'Hoy no toca ningún hábito. Puedes añadir uno nuevo abajo.', 'No habits are due today. You can add a new one below.')
                  : tx(lang, `Cumple los hábitos programados para sumar puntos. ${digest.doneToday} de ${digest.dueToday} completados.`, `Complete the scheduled habits to earn points. ${digest.doneToday} of ${digest.dueToday} done.`)}
              </div>
            </div>
            <ProgressBar
              label={tx(lang, 'Progreso diario', 'Daily progress')}
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
                  {tx(
                    lang,
                    'Todavía no hay hábitos. Crea uno con el formulario de abajo o carga los ejemplos para empezar en diez segundos.',
                    'No habits yet. Create one with the form below or load the examples to get started in ten seconds.',
                  )}
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
                        aria-label={done ? tx(lang, `Desmarcar ${habit.name}`, `Uncheck ${habit.name}`) : tx(lang, `Completar ${habit.name}`, `Complete ${habit.name}`)}
                        onClick={() => void toggleHabit(habit)}
                        disabled={!habit.enabled}
                      >
                        {done ? '✓' : ''}
                      </button>
                      <div className="habit-main">
                        <div className="habit-title">
                          {habit.name}
                          {!habit.enabled && <span className="badge badge-muted">{tx(lang, 'Pausado', 'Paused')}</span>}
                          {due && !done && <span className="badge badge-primary">{tx(lang, 'Hoy', 'Today')}</span>}
                        </div>
                        <div className="habit-sub">
                          {habitScheduleLabel(habit, lang)} · {habit.points} pts
                          {habit.frequency !== 'daily' && tx(lang, ` · ${weekDone}/${weeklyTarget(habit)} esta semana`, ` · ${weekDone}/${weeklyTarget(habit)} this week`)}
                        </div>
                        {habit.note && <div className="hint small">{habit.note}</div>}
                      </div>
                      <div className="habit-actions">
                        <button className="btn-icon" aria-label={tx(lang, `Editar ${habit.name}`, `Edit ${habit.name}`)} onClick={() => editHabit(habit)}>
                          <Icon name="settings" size={15} />
                        </button>
                        <button
                          className="btn-icon"
                          aria-label={habit.enabled ? tx(lang, `Pausar ${habit.name}`, `Pause ${habit.name}`) : tx(lang, `Activar ${habit.name}`, `Enable ${habit.name}`)}
                          onClick={() => void toggleEnabled(habit)}
                        >
                          <Icon name={habit.enabled ? 'clock' : 'check'} size={15} />
                        </button>
                        <button className="btn-icon" aria-label={tx(lang, `Eliminar ${habit.name}`, `Delete ${habit.name}`)} onClick={() => void removeHabit(habit)}>
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
                <span className="field-label">{form.id ? tx(lang, 'Editar hábito', 'Edit habit') : tx(lang, 'Nuevo hábito', 'New habit')}</span>
                {form.id && (
                  <button className="btn btn-ghost btn-sm" onClick={resetForm}>
                    {tx(lang, 'Cancelar edición', 'Cancel edit')}
                  </button>
                )}
              </div>
              <div className="grid grid-3">
                <label className="field">
                  <span className="field-label">{tx(lang, 'Nombre', 'Name')}</span>
                  <input
                    className="input"
                    value={form.name}
                    maxLength={80}
                    onChange={(event) => updateForm('name', event.target.value)}
                    placeholder={tx(lang, 'Caminar 20 minutos', 'Walk 20 minutes')}
                  />
                </label>
                <label className="field">
                  <span className="field-label">{tx(lang, 'Frecuencia', 'Frequency')}</span>
                  <Select
                    value={form.frequency}
                    onChange={(value) => updateForm('frequency', value as HabitFrequency)}
                    options={[
                      { value: 'daily', label: tx(lang, 'Diario', 'Daily') },
                      { value: 'weekly', label: tx(lang, 'Semanal', 'Weekly') },
                      { value: 'monthly', label: tx(lang, 'Mensual', 'Monthly') },
                    ]}
                  />
                </label>
                <label className="field">
                  <span className="field-label">{tx(lang, 'Puntos', 'Points')}</span>
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
                  <span className="field-label">{tx(lang, 'Días de la semana (opcional)', 'Days of the week (optional)')}</span>
                  <div className="chips">
                    {(lang === 'en' ? DAY_NAMES_EN : DAY_NAMES_ES).map((day, index) => (
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
                      <span className="field-label">{tx(lang, 'Veces por semana', 'Times per week')}</span>
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
                  <span className="field-label">{tx(lang, 'Día del mes', 'Day of the month')}</span>
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
                <span className="field-label">{tx(lang, 'Nota (opcional)', 'Note (optional)')}</span>
                <input
                  className="input"
                  value={form.note}
                  maxLength={160}
                  onChange={(event) => updateForm('note', event.target.value)}
                  placeholder={tx(lang, 'Por qué te importa este hábito', 'Why this habit matters to you')}
                />
              </label>
              <button className="btn btn-primary" onClick={saveHabit} disabled={busy}>
                <Icon name="check" size={15} /> {form.id ? tx(lang, 'Guardar cambios', 'Save changes') : tx(lang, 'Añadir hábito', 'Add habit')}
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="spark" /> {tx(lang, 'Ánimo de hoy', "Today's mood")}</div>
              <div className="card-sub">{tx(lang, 'Un registro rápido ayuda a detectar semanas de baja energía antes de que afecten al entrenamiento.', 'A quick log helps spot low-energy weeks before they affect training.')}</div>
            </div>
            <span className={`badge ${digest.moodToday ? 'badge-success' : 'badge-muted'}`}>
              {digest.moodToday ? tx(lang, 'Registrado', 'Logged') : tx(lang, 'Sin registrar', 'Not logged')}
            </span>
          </div>
          <div className="card-body stack">
            <div className="mood-row">
              {faces.map((face) => (
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
              <span className="field-label">{tx(lang, 'Resumen del día · máximo 5 palabras', 'Day summary · 5 words max')}</span>
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
                {tx(lang, `${wordCount}/5 palabras`, `${wordCount}/5 words`)}
                {!summaryTouched && tx(lang, ` · Sugerencia: “${suggestedSummary}”`, ` · Suggestion: “${suggestedSummary}”`)}
              </span>
            </label>
            <div className="row wrap">
              <button className="btn btn-ghost btn-sm" onClick={useSuggestion}>
                {tx(lang, 'Usar sugerencia', 'Use suggestion')}
              </button>
              <span className="hint">{tx(lang, 'La sugerencia se genera con tus hábitos y el ánimo elegido.', 'The suggestion is generated from your habits and selected mood.')}</span>
            </div>
            <label className="field">
              <span className="field-label">{tx(lang, 'Nota (opcional)', 'Note (optional)')}</span>
              <textarea
                className="input textarea"
                rows={3}
                value={moodNote}
                maxLength={400}
                onChange={(event) => setMoodNote(event.target.value)}
                placeholder={tx(lang, 'Dormí mal, pero el entrenamiento salió bien…', 'Slept badly, but the workout went well…')}
              />
            </label>
            <button className="btn btn-primary" onClick={saveMood} disabled={busy}>
              <Icon name="check" size={15} /> {tx(lang, 'Guardar ánimo y resumen', 'Save mood and summary')}
            </button>
            {digest.moodToday?.summary && (
              <div className="notice notice-success">
                <Icon name="check" size={16} />
                <div>
                  <strong>{tx(lang, `Resumen de hoy: “${digest.moodToday.summary}”`, `Today's summary: “${digest.moodToday.summary}”`)}</strong>
                  <div className="small">
                    {faces.find((face) => face.value === digest.moodToday?.mood)?.label}
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
              <div className="card-title"><Icon name="calendar" /> {tx(lang, 'Semana', 'Week')}</div>
              <div className="card-sub">{tx(lang, 'Puntos, hábitos completados y ánimo de los últimos siete días.', 'Points, completed habits and mood over the last seven days.')}</div>
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
                  {day.mood ? ` · ${faces.find((face) => face.value === day.mood)?.face}` : ''}
                </span>
              </div>
            ))}
            {digest.summaries.length > 0 && (
              <>
                <div className="divider" />
                <span className="field-label">{tx(lang, 'Últimos resúmenes', 'Latest summaries')}</span>
                <div className="list">
                  {digest.summaries.slice(0, 7).map((entry) => (
                    <div key={entry.date} className="list-item">
                      <div className="list-item-main">
                        <span className="list-item-title">
                          {entry.summary || tx(lang, 'Sin resumen', 'No summary')} <span className="hint">· {formatShort(entry.date, lang)}</span>
                        </span>
                        {entry.note && <span className="list-item-sub">{entry.note}</span>}
                      </div>
                      <span className="badge badge-muted">
                        {faces.find((face) => face.value === entry.mood)?.face ?? '—'}
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
        {tx(
          lang,
          'Los puntos son una herramienta de adherencia, no una medida clínica. Si el ánimo baja de forma persistente, habla con un profesional. Todo se guarda solo en tu bóveda local.',
          'Points are an adherence tool, not a clinical measure. If your mood stays low, talk to a professional. Everything is stored only in your local vault.',
        )}
      </p>
    </div>
  );
}
