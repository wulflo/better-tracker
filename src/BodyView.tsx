import React, { useEffect, useMemo, useState } from 'react';
import type { BodyMeasures, MeasurementEntry, Sex, VaultEvent } from './types';
import { EMPTY_MEASURES } from './types';
import { appendEvent, newEvent } from './vault';
import {
  activityLevelFromEvents,
  activityOption,
  bodyComposition,
  computeMacros,
  formatShort,
  goalModeFromEvents,
  latestMeasurement,
  reduceExercises,
  reduceWeights,
  todayISO,
  trainingSummary,
} from './metrics';
import { classifyValue, projectBody, safeBmiRange, safeBodyFatRange } from './bodyRange';
import BodyFigure from './BodyFigure';
import Select from './components/Select';
import { NumberInput, Field, EmptyState, Stat } from './components/Fields';
import { Icon } from './components/Icons';
import { MiniSparkline } from './components/Charts';
import FatTrend from './components/FatTrend';
import { tx, useLanguage } from './i18n';

interface Props {
  deviceId: string;
  events: VaultEvent[];
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

export default function BodyView({ deviceId, events, onRefresh, notify }: Props) {
  const { lang } = useLanguage();
  const lastMeas = latestMeasurement(events);
  const lastMeasEventId = [...events].reverse().find((e) => e.kind === 'measurement.saved')?.id;
  const [form, setForm] = useState<MeasurementEntry>({
    ...EMPTY_MEASURES,
    ...(lastMeas ?? {}),
    date: lastMeas?.date ?? todayISO(),
  });
  useEffect(() => {
    if (!lastMeasEventId) return;
    const latest = latestMeasurement(events);
    if (latest) setForm({ ...EMPTY_MEASURES, ...latest, date: latest.date });
  }, [lastMeasEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const weights = useMemo(() => reduceWeights(events), [events]);
  const comp = useMemo(() => bodyComposition(form, lang), [form, lang]);
  const latestWeight = weights.length ? weights[weights.length - 1] : null;
  const goal = useMemo(() => goalModeFromEvents(events), [events]);
  const activity = useMemo(() => activityLevelFromEvents(events), [events]);
  const exerciseSummary = useMemo(
    () => trainingSummary(events, reduceExercises(events)),
    [events],
  );
  const projection = useMemo(
    () => projectBody(form, goal, exerciseSummary.weekMinutes, activity, comp, lang),
    [form, goal, exerciseSummary.weekMinutes, activity, comp, lang],
  );
  const macros = useMemo(
    () => computeMacros(form, exerciseSummary.weekMinutes, goal, activity, lang),
    [form, exerciseSummary.weekMinutes, goal, activity, lang],
  );
  const bmiRange = safeBmiRange(form.age, lang);
  const fatRange = safeBodyFatRange(form.sex, form.age, lang);
  const bmiStatus = classifyValue(comp.bmi, bmiRange, lang);
  const fatStatus = classifyValue(comp.avg, fatRange, lang);

  const set = <K extends keyof BodyMeasures>(key: K, value: BodyMeasures[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setField = <K extends keyof MeasurementEntry>(key: K, value: MeasurementEntry[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const save = async () => {
    if (form.weight < 0 || form.height < 0 || form.age < 0) {
      notify(tx(lang, 'Las medidas no pueden ser negativas.', "Measurements can't be negative."), 'error');
      return;
    }
    await appendEvent(newEvent(deviceId, 'measurement.saved', { ...form }));
    await onRefresh();
    notify(tx(lang, 'Medidas guardadas.', 'Measurements saved.'), 'success');
  };

  const useLatestWeight = () => {
    if (latestWeight) set('weight', latestWeight.kg);
    else notify(tx(lang, 'Todavía no hay un peso registrado en el Panel.', 'No weight has been logged on the Dashboard yet.'), 'info');
  };

  const estimatedFields = [
    comp.avg !== null ? tx(lang, '% grasa', '% fat') : null,
    comp.bmi !== null ? tx(lang, 'IMC', 'BMI') : null,
    comp.fatMass !== null ? tx(lang, 'masa grasa', 'fat mass') : null,
    comp.leanMass !== null ? tx(lang, 'masa magra', 'lean mass') : null,
  ].filter(Boolean) as string[];

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{tx(lang, 'Figura corporal', 'Body figure')}</h1>
          <p className="page-sub">
            {tx(
              lang,
              'Silueta y composición adaptativas. Usa peso, altura, edad, sexo y circunferencias; cuantos más datos, mejor, pero la app calcula con lo que haya disponible.',
              'Adaptive silhouette and composition. Uses weight, height, age, sex and circumferences; the more data the better, but the app works with whatever is available.',
            )}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-tonal" onClick={useLatestWeight}>
            <Icon name="scale" size={15} /> {tx(lang, 'Usar último peso', 'Use latest weight')}
          </button>
          <button className="btn btn-primary" onClick={save}><Icon name="check" size={15} /> {tx(lang, 'Guardar medidas', 'Save measurements')}</button>
        </div>
      </header>

      <div className="grid grid-4">
        <Stat
          label={tx(lang, '% grasa estimado', 'Estimated % fat')}
          value={comp.avg !== null ? `${comp.avg.toFixed(1)}%` : '—'}
          caption={
            comp.min !== null && comp.max !== null
              ? tx(
                  lang,
                  `Rango ${comp.min.toFixed(1)}–${comp.max.toFixed(1)}% · ${fatStatus.label}${comp.confidence !== null ? ` · confianza ${comp.confidence}%` : ''}`,
                  `Range ${comp.min.toFixed(1)}–${comp.max.toFixed(1)}% · ${fatStatus.label}${comp.confidence !== null ? ` · ${comp.confidence}% confidence` : ''}`,
                )
              : tx(lang, 'Añade datos para estimar', 'Add data to estimate')
          }
        />
        <Stat
          label={tx(lang, 'Masa grasa', 'Fat mass')}
          value={comp.fatMass !== null ? `${comp.fatMass.toFixed(1)} kg` : '—'}
          caption={comp.fatMass !== null ? tx(lang, 'Peso × % grasa estimado', 'Weight × estimated % fat') : form.weight > 0 ? tx(lang, 'Falta una estimación de % grasa', 'Missing a % fat estimate') : tx(lang, 'Falta el peso', 'Missing weight')}
        />
        <Stat
          label={tx(lang, 'Masa magra', 'Lean mass')}
          value={comp.leanMass !== null ? `${comp.leanMass.toFixed(1)} kg` : '—'}
          caption={comp.bmrKatch !== null ? tx(lang, `Katch ${Math.round(comp.bmrKatch)} kcal`, `Katch ${Math.round(comp.bmrKatch)} kcal`) : tx(lang, 'Requiere composición', 'Requires composition')}
        />
        <Stat
          label={tx(lang, 'IMC', 'BMI')}
          value={comp.bmi !== null ? comp.bmi.toFixed(1) : '—'}
          caption={comp.bmi !== null ? `${bmiRange.label} · ${bmiStatus.label}` : tx(lang, 'Faltan peso y altura', 'Missing weight and height')}
        />
      </div>

      <FatTrend events={events} />

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="target" /> {tx(lang, 'Rango seguro y progreso proyectado', 'Safe range and projected progress')}</div>
            <div className="card-sub">
              {tx(
                lang,
                'Detectado automáticamente con sexo, edad, peso, altura y composición. El ritmo parte del objetivo calórico y del nivel de actividad guardados en el Panel.',
                'Detected automatically from sex, age, weight, height and composition. The pace comes from the calorie goal and activity level saved on the Dashboard.',
              )}
            </div>
          </div>
          <span className={`badge ${projection.safe ? 'badge-success' : 'badge-warning'}`}>
            {projection.safe ? tx(lang, 'Rango seguro', 'Safe range') : tx(lang, 'Límite alcanzado', 'Limit reached')}
          </span>
        </div>
        <div className="card-body stack">
          <div className="grid grid-4">
            <div className="metric">
              <div className="metric-label">{tx(lang, 'IMC saludable', 'Healthy BMI')}</div>
              <div className="metric-value-lg">{bmiRange.min.toFixed(1)}–{bmiRange.max.toFixed(1)}</div>
              <div className="metric-caption">{bmiStatus.label}{comp.bmi !== null ? tx(lang, ` · actual ${comp.bmi.toFixed(1)}`, ` · current ${comp.bmi.toFixed(1)}`) : ''}</div>
            </div>
            <div className="metric">
              <div className="metric-label">{tx(lang, '% grasa orientativo', 'Reference % fat')}</div>
              <div className="metric-value-lg">{fatRange ? `${fatRange.min}–${fatRange.max}%` : '—'}</div>
              <div className="metric-caption">{fatRange ? fatStatus.label : tx(lang, 'Añade sexo y edad', 'Add sex and age')}</div>
            </div>
            <div className="metric">
              <div className="metric-label">{tx(lang, 'Objetivo', 'Target')}</div>
              <div className="metric-value-lg">{projection.targetWeight !== null ? `${projection.targetWeight.toFixed(1)} kg` : '—'}</div>
              <div className="metric-caption">
                {projection.targetBodyFat !== null ? tx(lang, `${projection.targetBodyFat.toFixed(0)}% grasa`, `${projection.targetBodyFat.toFixed(0)}% fat`) : tx(lang, 'Sin estimación', 'No estimate')}
                {projection.targetBmi !== null ? tx(lang, ` · IMC ${projection.targetBmi.toFixed(1)}`, ` · BMI ${projection.targetBmi.toFixed(1)}`) : ''}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">{tx(lang, 'Ritmo y fecha', 'Pace and date')}</div>
              <div className="metric-value-lg">
                {projection.weeklyRateKg > 0 ? `${projection.weeklyRateKg.toFixed(2)} kg` : '—'}
              </div>
              <div className="metric-caption">
                {projection.weeklyRateKg > 0 ? tx(lang, 'por semana', 'per week') : tx(lang, 'sin déficit ni superávit', 'no deficit or surplus')}
                {projection.etaDate ? ` · ${formatShort(projection.etaDate, lang)}` : ''}
              </div>
            </div>
          </div>

          <div className={`notice ${projection.safe ? 'notice-info' : 'notice-warn'}`}>
            <Icon name={projection.safe ? 'info' : 'alert'} size={16} />
            <div>
              <strong>{projection.message}</strong>
              <div className="small muted">
                {bmiRange.note} {fatRange?.note ?? ''} {tx(lang, 'El cálculo es orientativo y no sustituye una valoración médica.', 'This calculation is a guide and does not replace a medical assessment.')}
              </div>
            </div>
          </div>

          {projection.milestones.length > 0 && (
            <div className="projection-track">
              <span className="field-label">{tx(lang, 'Progreso esperado', 'Expected progress')}</span>
              <div className="projection-steps">
                {projection.milestones.map((milestone) => (
                  <div key={milestone.date} className="projection-step">
                    <strong>{milestone.weight.toFixed(1)} kg</strong>
                    <span className="small muted">{formatShort(milestone.date, lang)}</span>
                    {milestone.bodyFat !== null && <span className="small">≈{milestone.bodyFat.toFixed(1)}%</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="body-layout">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="body" /> {tx(lang, 'Silueta adaptativa', 'Adaptive silhouette')}</div>
              <div className="card-sub">{tx(lang, 'La forma cambia con las circunferencias. Los nodos se pueden arrastrar.', 'The shape changes with circumferences. Nodes can be dragged.')}</div>
            </div>
            {weights.length > 1 && (
              <div style={{ width: 150 }}>
                <MiniSparkline values={weights.slice(-14).map((w) => w.kg)} />
                <div className="hint right">{tx(lang, 'Peso reciente', 'Recent weight')}</div>
              </div>
            )}
          </div>
          <div className="card-body">
            <BodyFigure measures={form} onChange={(m) => setForm((f) => ({ ...f, ...m }))} />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Icon name="target" /> {tx(lang, 'Composición', 'Composition')}</div>
              <div className="card-sub">{tx(lang, 'Resultados con los datos actuales, sin exigir el formulario completo.', 'Results from the current data, without requiring the full form.')}</div>
            </div>
            <span className="badge badge-muted">
              {tx(lang, `${comp.methods.length} método(s)`, `${comp.methods.length} method(s)`)}
              {comp.confidence !== null ? ` · ${comp.confidence}%` : ''}
            </span>
          </div>
          <div className="card-body stack">
            {comp.methods.length === 0 ? (
              <EmptyState
                icon={<Icon name="scale" />}
                title={tx(lang, 'Faltan datos para estimar', 'Not enough data to estimate')}
                sub={tx(lang, 'Con cintura/abdomen + altura se activa RFM. Añade cuello (y cadera en mujeres) para Navy; abdomen al ombligo para Ejército, Marines y Friedl. En mujeres, antebrazo, muñeca, brazo y muslo completan las ecuaciones del Ejército y Marines.', 'Waist/abdomen + height enables RFM. Add neck (and hip for women) for Navy; navel abdomen for Army, Marine Corps and Friedl. For women, forearm, wrist, arm and thigh complete the Army and Marine equations.')}
              />
            ) : (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{tx(lang, 'Método', 'Method')}</th>
                      <th>{tx(lang, '% grasa', '% fat')}</th>
                      <th title={tx(lang, 'Peso dentro del consenso ponderado', 'Weight inside the weighted consensus')}>
                        {tx(lang, 'Peso', 'Weight')}
                      </th>
                      <th>{tx(lang, 'Datos', 'Data')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comp.methods.map((m) => (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td className="mono strong">{m.value.toFixed(1)}%</td>
                        <td className="small muted">{Math.round(m.weight ?? 0)}%</td>
                        <td className="small muted">{m.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="hint">
                  {tx(
                    lang,
                    `Consenso ponderado por el error publicado de cada ecuación y por los datos disponibles. Cobertura de medidas útiles: ${comp.coverage}%. Los métodos de la misma familia se reparten el peso para no contar dos veces la misma información.`,
                    `Weighted consensus based on each equation's published error and the available data. Useful measurement coverage: ${comp.coverage}%. Methods in the same family share their weight so the same information is not counted twice.`,
                  )}
                </p>
              </>
            )}

            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="metric">
                <div className="metric-label">BMR Mifflin</div>
                <div className="metric-value-lg">{comp.bmrMifflin !== null ? `${Math.round(comp.bmrMifflin)}` : '—'}</div>
                <div className="metric-caption">{tx(lang, 'kcal/día en reposo', 'kcal/day at rest')}</div>
              </div>
              <div className="metric">
                <div className="metric-label">{tx(lang, 'TDEE estimado', 'Estimated TDEE')}</div>
                <div className="metric-value-lg">{macros ? `${Math.round(macros.tdee)}` : '—'}</div>
                <div className="metric-caption">{activityOption(activity, lang).label} · {goal === 'cut' ? tx(lang, 'déficit', 'deficit') : goal === 'bulk' ? tx(lang, 'superávit', 'surplus') : tx(lang, 'mantenimiento', 'maintenance')}</div>
              </div>
              <div className="metric">
                <div className="metric-label">{tx(lang, 'Cintura/cadera', 'Waist/hip')}</div>
                <div className="metric-value-lg">{comp.whr !== null ? comp.whr.toFixed(2) : '—'}</div>
                <div className="metric-caption">{tx(lang, 'riesgo metabólico orientativo', 'reference metabolic risk')}</div>
              </div>
              <div className="metric">
                <div className="metric-label">{tx(lang, 'Cintura/altura', 'Waist/height')}</div>
                <div className="metric-value-lg">{comp.whtr !== null ? comp.whtr.toFixed(2) : '—'}</div>
                <div className="metric-caption">{tx(lang, 'objetivo < 0.5', 'target < 0.5')}</div>
              </div>
            </div>

            <div className="divider" />

            <div className="stack-sm">
              <span className="field-label">{tx(lang, 'Datos usados', 'Data used')}</span>
              <div className="chips">
                {estimatedFields.length ? estimatedFields.map((f) => <span key={f} className="chip active">{f}</span>) : <span className="hint">{tx(lang, 'Ninguno todavía.', 'None yet.')}</span>}
              </div>
            </div>

            {comp.missing.length > 0 && (
              <div className="notice notice-info">
                <Icon name="info" size={16} />
                <div>
                  <strong>{tx(lang, 'Puedes añadir más datos', 'You can add more data')}</strong>
                  <div className="small">
                    {tx(lang, `Faltan: ${comp.missing.join(', ')}. No son obligatorios: cada método se activa cuando tiene lo necesario.`, `Missing: ${comp.missing.join(', ')}. They are optional: each method activates when it has what it needs.`)}
                  </div>
                </div>
              </div>
            )}

            {comp.bmrKatch !== null && comp.bmrCunningham !== null && (
              <div className="row wrap">
                <span className="badge badge-primary">Katch-McArdle: {Math.round(comp.bmrKatch)} kcal</span>
                <span className="badge badge-primary">Cunningham: {Math.round(comp.bmrCunningham)} kcal</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="scale" /> {tx(lang, 'Medidas', 'Measurements')}</div>
            <div className="card-sub">{tx(lang, 'Los campos vacíos se tratan como dato ausente, no como cero. Se guardan como un evento nuevo.', 'Empty fields are treated as missing data, not as zero. They are saved as a new event.')}</div>
          </div>
          <span className="badge badge-muted">{lastMeas ? tx(lang, `Última ${lastMeas.date}`, `Latest ${lastMeas.date}`) : tx(lang, 'Sin medidas guardadas', 'No saved measurements')}</span>
        </div>
        <div className="card-body stack">
          <div className="grid grid-4">
            <Field label={tx(lang, 'Fecha', 'Date')}><input className="input" type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} /></Field>
            <Field label={tx(lang, 'Sexo', 'Sex')}>
              <Select
                value={form.sex}
                onChange={(v) => set('sex', v as Sex)}
                options={[
                  { value: 'unspecified', label: tx(lang, 'Sin especificar', 'Unspecified') },
                  { value: 'male', label: tx(lang, 'Hombre', 'Male') },
                  { value: 'female', label: tx(lang, 'Mujer', 'Female') },
                ]}
              />
            </Field>
            <Field label={tx(lang, 'Edad', 'Age')}><NumberInput value={form.age} onChange={(v) => set('age', v)} placeholder="30" min={10} max={100} /></Field>
            <Field label={tx(lang, 'Peso (kg)', 'Weight (kg)')}><NumberInput value={form.weight} onChange={(v) => set('weight', v)} placeholder="75" min={20} max={400} step={0.1} /></Field>
            <Field label={tx(lang, 'Altura (cm)', 'Height (cm)')}><NumberInput value={form.height} onChange={(v) => set('height', v)} placeholder="175" min={100} max={230} /></Field>
            <Field label={tx(lang, 'Cuello (cm)', 'Neck (cm)')}><NumberInput value={form.neck} onChange={(v) => set('neck', v)} placeholder="38" min={20} max={70} /></Field>
            <Field label={tx(lang, 'Pecho (cm)', 'Chest (cm)')}><NumberInput value={form.chest} onChange={(v) => set('chest', v)} placeholder="100" min={50} max={180} /></Field>
            <Field label={tx(lang, 'Cintura (cm)', 'Waist (cm)')}><NumberInput value={form.waist} onChange={(v) => set('waist', v)} placeholder="85" min={40} max={180} /></Field>
            <Field label={tx(lang, 'Abdomen ombligo (cm)', 'Navel abdomen (cm)')}><NumberInput value={form.abdomen} onChange={(v) => set('abdomen', v)} placeholder="85" min={40} max={180} /></Field>
            <Field label={tx(lang, 'Cadera (cm)', 'Hip (cm)')}><NumberInput value={form.hip} onChange={(v) => set('hip', v)} placeholder="95" min={40} max={180} /></Field>
            <Field label={tx(lang, 'Brazo (cm)', 'Arm (cm)')}><NumberInput value={form.arm} onChange={(v) => set('arm', v)} placeholder="32" min={15} max={70} /></Field>
            <Field label={tx(lang, 'Antebrazo (cm)', 'Forearm (cm)')}><NumberInput value={form.forearm} onChange={(v) => set('forearm', v)} placeholder="25" min={15} max={45} /></Field>
            <Field label={tx(lang, 'Muslo (cm)', 'Thigh (cm)')}><NumberInput value={form.thigh} onChange={(v) => set('thigh', v)} placeholder="55" min={25} max={100} /></Field>
            <Field label={tx(lang, 'Pantorrilla (cm)', 'Calf (cm)')}><NumberInput value={form.calf} onChange={(v) => set('calf', v)} placeholder="38" min={20} max={70} /></Field>
            <Field label={tx(lang, 'Muñeca (cm)', 'Wrist (cm)')}><NumberInput value={form.wrist} onChange={(v) => set('wrist', v)} placeholder="17" min={10} max={30} /></Field>
          </div>
          <div className="row between wrap">
            <span className="hint">
              {tx(
                lang,
                'Fórmulas: Navy/Air Force, RFM (sin peso), Deurenberg, CUN-BAE, Ejército (Vogel y versión 2023), Marines (Wright), Friedl, Mifflin-St Jeor, Katch-McArdle y Cunningham. El abdomen se mide a la altura del ombligo y la cintura en su punto más estrecho. Son estimaciones, no diagnóstico médico.',
                'Formulas: Navy/Air Force, RFM (weight-free), Deurenberg, CUN-BAE, Army (Vogel and 2023), Marine Corps (Wright), Friedl, Mifflin-St Jeor, Katch-McArdle and Cunningham. Abdomen is measured at the navel and waist at its narrowest point. These are estimates, not a medical diagnosis.',
              )}
            </span>
            <button className="btn btn-primary" onClick={save}><Icon name="check" size={15} /> {tx(lang, 'Guardar medidas', 'Save measurements')}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
