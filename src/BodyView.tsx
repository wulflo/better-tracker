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

interface Props {
  deviceId: string;
  events: VaultEvent[];
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

export default function BodyView({ deviceId, events, onRefresh, notify }: Props) {
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
  const comp = useMemo(() => bodyComposition(form), [form]);
  const latestWeight = weights.length ? weights[weights.length - 1] : null;
  const goal = useMemo(() => goalModeFromEvents(events), [events]);
  const activity = useMemo(() => activityLevelFromEvents(events), [events]);
  const exerciseSummary = useMemo(
    () => trainingSummary(events, reduceExercises(events)),
    [events],
  );
  const projection = useMemo(
    () => projectBody(form, goal, exerciseSummary.weekMinutes, activity, comp),
    [form, goal, exerciseSummary.weekMinutes, activity, comp],
  );
  const macros = useMemo(
    () => computeMacros(form, exerciseSummary.weekMinutes, goal, activity),
    [form, exerciseSummary.weekMinutes, goal, activity],
  );
  const bmiRange = safeBmiRange(form.age);
  const fatRange = safeBodyFatRange(form.sex, form.age);
  const bmiStatus = classifyValue(comp.bmi, bmiRange);
  const fatStatus = classifyValue(comp.avg, fatRange);

  const set = <K extends keyof BodyMeasures>(key: K, value: BodyMeasures[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setField = <K extends keyof MeasurementEntry>(key: K, value: MeasurementEntry[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const save = async () => {
    if (form.weight < 0 || form.height < 0 || form.age < 0) {
      notify('Las medidas no pueden ser negativas.', 'error');
      return;
    }
    await appendEvent(newEvent(deviceId, 'measurement.saved', { ...form }));
    await onRefresh();
    notify('Medidas guardadas.', 'success');
  };

  const useLatestWeight = () => {
    if (latestWeight) set('weight', latestWeight.kg);
    else notify('Todavía no hay un peso registrado en el Panel.', 'info');
  };

  const estimatedFields = [
    comp.avg !== null ? '% grasa' : null,
    comp.bmi !== null ? 'IMC' : null,
    comp.fatMass !== null ? 'masa grasa' : null,
    comp.leanMass !== null ? 'masa magra' : null,
  ].filter(Boolean) as string[];

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Figura corporal</h1>
          <p className="page-sub">
            Silueta y composición adaptativas. Usa peso, altura, edad, sexo y circunferencias; cuantos más datos, mejor,
            pero la app calcula con lo que haya disponible.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-tonal" onClick={useLatestWeight}>
            <Icon name="scale" size={15} /> Usar último peso
          </button>
          <button className="btn btn-primary" onClick={save}><Icon name="check" size={15} /> Guardar medidas</button>
        </div>
      </header>

      <div className="grid grid-4">
        <Stat
          label="% grasa estimado"
          value={comp.avg !== null ? `${comp.avg.toFixed(1)}%` : '—'}
          caption={
            comp.min !== null && comp.max !== null
              ? `Rango ${comp.min.toFixed(1)}–${comp.max.toFixed(1)}% · ${fatStatus.label}`
              : 'Añade datos para estimar'
          }
        />
        <Stat
          label="Masa grasa"
          value={comp.fatMass !== null ? `${comp.fatMass.toFixed(1)} kg` : '—'}
          caption={comp.fatMass !== null ? 'Peso × % grasa estimado' : form.weight > 0 ? 'Falta una estimación de % grasa' : 'Falta el peso'}
        />
        <Stat
          label="Masa magra"
          value={comp.leanMass !== null ? `${comp.leanMass.toFixed(1)} kg` : '—'}
          caption={comp.bmrKatch !== null ? `Katch ${Math.round(comp.bmrKatch)} kcal` : 'Requiere composición'}
        />
        <Stat
          label="IMC"
          value={comp.bmi !== null ? comp.bmi.toFixed(1) : '—'}
          caption={comp.bmi !== null ? `${bmiRange.label} · ${bmiStatus.label}` : 'Faltan peso y altura'}
        />
      </div>

      <FatTrend events={events} />

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Icon name="target" /> Rango seguro y progreso proyectado</div>
            <div className="card-sub">
              Detectado automáticamente con sexo, edad, peso, altura y composición. El ritmo parte del objetivo
              calórico y del nivel de actividad guardados en el Panel.
            </div>
          </div>
          <span className={`badge ${projection.safe ? 'badge-success' : 'badge-warning'}`}>
            {projection.safe ? 'Rango seguro' : 'Límite alcanzado'}
          </span>
        </div>
        <div className="card-body stack">
          <div className="grid grid-4">
            <div className="metric">
              <div className="metric-label">IMC saludable</div>
              <div className="metric-value-lg">{bmiRange.min.toFixed(1)}–{bmiRange.max.toFixed(1)}</div>
              <div className="metric-caption">{bmiStatus.label}{comp.bmi !== null ? ` · actual ${comp.bmi.toFixed(1)}` : ''}</div>
            </div>
            <div className="metric">
              <div className="metric-label">% grasa orientativo</div>
              <div className="metric-value-lg">{fatRange ? `${fatRange.min}–${fatRange.max}%` : '—'}</div>
              <div className="metric-caption">{fatRange ? fatStatus.label : 'Añade sexo y edad'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Objetivo</div>
              <div className="metric-value-lg">{projection.targetWeight !== null ? `${projection.targetWeight.toFixed(1)} kg` : '—'}</div>
              <div className="metric-caption">
                {projection.targetBodyFat !== null ? `${projection.targetBodyFat.toFixed(0)}% grasa` : 'Sin estimación'}
                {projection.targetBmi !== null ? ` · IMC ${projection.targetBmi.toFixed(1)}` : ''}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Ritmo y fecha</div>
              <div className="metric-value-lg">
                {projection.weeklyRateKg > 0 ? `${projection.weeklyRateKg.toFixed(2)} kg` : '—'}
              </div>
              <div className="metric-caption">
                {projection.weeklyRateKg > 0 ? 'por semana' : 'sin déficit ni superávit'}
                {projection.etaDate ? ` · ${formatShort(projection.etaDate)}` : ''}
              </div>
            </div>
          </div>

          <div className={`notice ${projection.safe ? 'notice-info' : 'notice-warn'}`}>
            <Icon name={projection.safe ? 'info' : 'alert'} size={16} />
            <div>
              <strong>{projection.message}</strong>
              <div className="small muted">
                {bmiRange.note} {fatRange?.note ?? ''} El cálculo es orientativo y no sustituye una valoración médica.
              </div>
            </div>
          </div>

          {projection.milestones.length > 0 && (
            <div className="projection-track">
              <span className="field-label">Progreso esperado</span>
              <div className="projection-steps">
                {projection.milestones.map((milestone) => (
                  <div key={milestone.date} className="projection-step">
                    <strong>{milestone.weight.toFixed(1)} kg</strong>
                    <span className="small muted">{formatShort(milestone.date)}</span>
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
              <div className="card-title"><Icon name="body" /> Silueta adaptativa</div>
              <div className="card-sub">La forma cambia con las circunferencias. Los nodos se pueden arrastrar.</div>
            </div>
            {weights.length > 1 && (
              <div style={{ width: 150 }}>
                <MiniSparkline values={weights.slice(-14).map((w) => w.kg)} />
                <div className="hint right">Peso reciente</div>
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
              <div className="card-title"><Icon name="target" /> Composición</div>
              <div className="card-sub">Resultados con los datos actuales, sin exigir el formulario completo.</div>
            </div>
            <span className="badge badge-muted">{comp.methods.length} método(s)</span>
          </div>
          <div className="card-body stack">
            {comp.methods.length === 0 ? (
              <EmptyState
                icon={<Icon name="scale" />}
                title="Faltan datos para estimar"
                sub="Con cintura + altura se activa RFM y Navy. Con peso + altura + edad se activan Deurenberg y CUN-BAE."
              />
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Método</th><th>% grasa</th><th>Datos</th></tr>
                </thead>
                <tbody>
                  {comp.methods.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td className="mono strong">{m.value.toFixed(1)}%</td>
                      <td className="small muted">{m.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="metric">
                <div className="metric-label">BMR Mifflin</div>
                <div className="metric-value-lg">{comp.bmrMifflin !== null ? `${Math.round(comp.bmrMifflin)}` : '—'}</div>
                <div className="metric-caption">kcal/día en reposo</div>
              </div>
              <div className="metric">
                <div className="metric-label">TDEE estimado</div>
                <div className="metric-value-lg">{macros ? `${Math.round(macros.tdee)}` : '—'}</div>
                <div className="metric-caption">{activityOption(activity).label} · {goal === 'cut' ? 'déficit' : goal === 'bulk' ? 'superávit' : 'mantenimiento'}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Cintura/cadera</div>
                <div className="metric-value-lg">{comp.whr !== null ? comp.whr.toFixed(2) : '—'}</div>
                <div className="metric-caption">riesgo metabólico orientativo</div>
              </div>
              <div className="metric">
                <div className="metric-label">Cintura/altura</div>
                <div className="metric-value-lg">{comp.whtr !== null ? comp.whtr.toFixed(2) : '—'}</div>
                <div className="metric-caption">objetivo &lt; 0.5</div>
              </div>
            </div>

            <div className="divider" />

            <div className="stack-sm">
              <span className="field-label">Datos usados</span>
              <div className="chips">
                {estimatedFields.length ? estimatedFields.map((f) => <span key={f} className="chip active">{f}</span>) : <span className="hint">Ninguno todavía.</span>}
              </div>
            </div>

            {comp.missing.length > 0 && (
              <div className="notice notice-info">
                <Icon name="info" size={16} />
                <div>
                  <strong>Puedes añadir más datos</strong>
                  <div className="small">Faltan: {comp.missing.join(', ')}. No son obligatorios: cada método se activa cuando tiene lo necesario.</div>
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
            <div className="card-title"><Icon name="scale" /> Medidas</div>
            <div className="card-sub">Los campos vacíos se tratan como dato ausente, no como cero. Se guardan como un evento nuevo.</div>
          </div>
          <span className="badge badge-muted">{lastMeas ? `Última ${lastMeas.date}` : 'Sin medidas guardadas'}</span>
        </div>
        <div className="card-body stack">
          <div className="grid grid-4">
            <Field label="Fecha"><input className="input" type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} /></Field>
            <Field label="Sexo">
              <Select
                value={form.sex}
                onChange={(v) => set('sex', v as Sex)}
                options={[
                  { value: 'unspecified', label: 'Sin especificar' },
                  { value: 'male', label: 'Hombre' },
                  { value: 'female', label: 'Mujer' },
                ]}
              />
            </Field>
            <Field label="Edad"><NumberInput value={form.age} onChange={(v) => set('age', v)} placeholder="30" min={10} max={100} /></Field>
            <Field label="Peso (kg)"><NumberInput value={form.weight} onChange={(v) => set('weight', v)} placeholder="75" min={20} max={400} step={0.1} /></Field>
            <Field label="Altura (cm)"><NumberInput value={form.height} onChange={(v) => set('height', v)} placeholder="175" min={100} max={230} /></Field>
            <Field label="Cuello (cm)"><NumberInput value={form.neck} onChange={(v) => set('neck', v)} placeholder="38" min={20} max={70} /></Field>
            <Field label="Pecho (cm)"><NumberInput value={form.chest} onChange={(v) => set('chest', v)} placeholder="100" min={50} max={180} /></Field>
            <Field label="Cintura (cm)"><NumberInput value={form.waist} onChange={(v) => set('waist', v)} placeholder="85" min={40} max={180} /></Field>
            <Field label="Cadera (cm)"><NumberInput value={form.hip} onChange={(v) => set('hip', v)} placeholder="95" min={40} max={180} /></Field>
            <Field label="Brazo (cm)"><NumberInput value={form.arm} onChange={(v) => set('arm', v)} placeholder="32" min={15} max={70} /></Field>
            <Field label="Muslo (cm)"><NumberInput value={form.thigh} onChange={(v) => set('thigh', v)} placeholder="55" min={25} max={100} /></Field>
            <Field label="Pantorrilla (cm)"><NumberInput value={form.calf} onChange={(v) => set('calf', v)} placeholder="38" min={20} max={70} /></Field>
            <Field label="Muñeca (cm)"><NumberInput value={form.wrist} onChange={(v) => set('wrist', v)} placeholder="17" min={10} max={30} /></Field>
          </div>
          <div className="row between wrap">
            <span className="hint">
              Fórmulas: Navy, RFM (sin peso), Deurenberg, CUN-BAE, Mifflin-St Jeor, Katch-McArdle y Cunningham. Son estimaciones, no diagnóstico médico.
            </span>
            <button className="btn btn-primary" onClick={save}><Icon name="check" size={15} /> Guardar medidas</button>
          </div>
        </div>
      </section>
    </div>
  );
}
