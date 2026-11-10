import { useEffect, useMemo, useState } from 'react';
import type { Lang } from './i18n';
import { tx } from './i18n';
import type { VaultEvent } from './types';
import {
  averageIntakeFromEvents,
  averageStepsFromEvents,
  estimateTraining,
  loggedIntakeAverage,
  stepActivityMultiplier,
  trainingFrequencyFromEvents,
  type FrequencyUnit,
  type TrainingEstimate,
  type TrainingSummary,
} from './metrics';
import { appendEvent, newEvent } from './vault';

export type ProjectionIntakeSource = 'manual' | 'logged' | 'target';

export interface ProjectionInputsController {
  frequencyPerWeek: number;
  frequencyUnit: FrequencyUnit;
  hasFrequency: boolean;
  setFrequencyPerWeek: (value: number) => void;
  setFrequencyUnit: (unit: FrequencyUnit) => void;
  saveFrequency: () => Promise<void>;
  steps: number;
  setSteps: (value: number) => void;
  saveSteps: () => Promise<void>;
  intakeKcal: number;
  setIntakeKcal: (value: number) => void;
  saveIntake: () => Promise<void>;
  useLoggedIntake: () => void;
  loggedIntake: { avg: number; days: number };
  effectiveIntake: number;
  intakeSource: ProjectionIntakeSource;
  training: TrainingEstimate;
  stepActivity: number | null;
}

interface Options {
  events: VaultEvent[];
  deviceId: string;
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  summary: TrainingSummary;
  lang: Lang;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Estado y persistencia de los datos manuales que alimentan la proyección:
 * frecuencia de entrenamiento, pasos medios e ingesta media. La proyección usa
 * los valores en borrador para previsualizar antes de guardar.
 */
export function useProjectionInputs({
  events,
  deviceId,
  onRefresh,
  notify,
  summary,
  lang,
}: Options): ProjectionInputsController {
  const storedFrequency = useMemo(() => trainingFrequencyFromEvents(events), [events]);
  const lastFrequencyEventId = useMemo(
    () => [...events].reverse().find((event) => event.kind === 'training.frequency')?.id,
    [events],
  );
  const [frequencyPerWeek, setFrequencyPerWeekState] = useState(
    storedFrequency?.perWeek ?? 0,
  );
  const [frequencyUnit, setFrequencyUnitState] = useState<FrequencyUnit>(
    storedFrequency?.unit ?? 'week',
  );
  const [hasFrequency, setHasFrequency] = useState(storedFrequency !== null);

  useEffect(() => {
    const stored = trainingFrequencyFromEvents(events);
    if (!stored) return;
    setFrequencyPerWeekState(stored.perWeek);
    setFrequencyUnitState(stored.unit);
    setHasFrequency(true);
  }, [lastFrequencyEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastStepsEventId = useMemo(
    () => [...events].reverse().find((event) => event.kind === 'steps.average')?.id,
    [events],
  );
  const [steps, setStepsState] = useState(() => averageStepsFromEvents(events));
  useEffect(() => {
    setStepsState(averageStepsFromEvents(events));
  }, [lastStepsEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastIntakeEventId = useMemo(
    () => [...events].reverse().find((event) => event.kind === 'intake.average')?.id,
    [events],
  );
  const [intakeKcal, setIntakeKcalState] = useState(() => averageIntakeFromEvents(events));
  useEffect(() => {
    setIntakeKcalState(averageIntakeFromEvents(events));
  }, [lastIntakeEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loggedIntake = useMemo(() => loggedIntakeAverage(events), [events]);
  const training = useMemo(
    () => estimateTraining(summary, hasFrequency ? frequencyPerWeek : null),
    [summary, hasFrequency, frequencyPerWeek],
  );
  const stepActivity = stepActivityMultiplier(steps);

  const effectiveIntake =
    intakeKcal > 0 ? intakeKcal : loggedIntake.days >= 3 ? loggedIntake.avg : 0;
  const intakeSource: ProjectionIntakeSource =
    intakeKcal > 0 ? 'manual' : loggedIntake.days >= 3 ? 'logged' : 'target';

  const setFrequencyPerWeek = (value: number) => {
    setFrequencyPerWeekState(Math.max(0, value));
    setHasFrequency(true);
  };

  const setFrequencyUnit = (unit: FrequencyUnit) => {
    setFrequencyUnitState(unit);
  };

  const saveFrequency = async () => {
    const perWeek = round1(Math.max(0, frequencyPerWeek));
    setFrequencyPerWeekState(perWeek);
    setHasFrequency(true);
    await appendEvent(
      newEvent(deviceId, 'training.frequency', { perWeek, unit: frequencyUnit }),
    );
    await onRefresh();
    notify(
      tx(lang, 'Frecuencia de entrenamiento guardada.', 'Training frequency saved.'),
      'success',
    );
  };

  const setSteps = (value: number) => setStepsState(Math.max(0, value));

  const saveSteps = async () => {
    const value = Math.max(0, Math.round(Number(steps) || 0));
    setStepsState(value);
    await appendEvent(newEvent(deviceId, 'steps.average', { steps: value }));
    await onRefresh();
    notify(tx(lang, 'Pasos promedio guardados.', 'Average steps saved.'), 'success');
  };

  const setIntakeKcal = (value: number) => setIntakeKcalState(Math.max(0, value));

  const saveIntake = async () => {
    const value = Math.max(0, Math.round(Number(intakeKcal) || 0));
    setIntakeKcalState(value);
    await appendEvent(newEvent(deviceId, 'intake.average', { kcal: value }));
    await onRefresh();
    notify(
      tx(lang, 'Calorías medias guardadas.', 'Average calories saved.'),
      'success',
    );
  };

  const useLoggedIntake = () => {
    if (loggedIntake.avg > 0) setIntakeKcalState(loggedIntake.avg);
  };

  return {
    frequencyPerWeek,
    frequencyUnit,
    hasFrequency,
    setFrequencyPerWeek,
    setFrequencyUnit,
    saveFrequency,
    steps,
    setSteps,
    saveSteps,
    intakeKcal,
    setIntakeKcal,
    saveIntake,
    useLoggedIntake,
    loggedIntake,
    effectiveIntake,
    intakeSource,
    training,
    stepActivity,
  };
}
