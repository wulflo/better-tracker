import type { FoodLogItem } from './types';

const DRAFT_KEY = 'bt.meal.draft.v1';

interface StoredDraft {
  date: string;
  items: FoodLogItem[];
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function sanitize(raw: unknown): FoodLogItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is FoodLogItem => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<FoodLogItem>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.foodId === 'string' &&
        typeof candidate.name === 'string' &&
        Number.isFinite(candidate.quantity) &&
        Number.isFinite(candidate.grams)
      );
    })
    .map((item) => ({
      ...item,
      quantity: Math.max(0, Number(item.quantity) || 0),
      grams: Math.max(0, Number(item.grams) || 0),
      kcal: Math.max(0, Number(item.kcal) || 0),
      protein: Math.max(0, Number(item.protein) || 0),
      carbs: Math.max(0, Number(item.carbs) || 0),
      fat: Math.max(0, Number(item.fat) || 0),
      fiber: Math.max(0, Number(item.fiber) || 0),
    }));
}

/**
 * El borrador de comidas es deliberadamente efímero: vive en localStorage y
 * solo se conserva mientras `date` siga siendo hoy. Al abrir la app otro día,
 * o al cruzar medianoche con la app abierta, se elimina.
 */
export function loadMealDraft(date: string): FoodLogItem[] {
  const store = storage();
  if (!store) return [];
  const raw = store.getItem(DRAFT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (parsed.date !== date || !Array.isArray(parsed.items)) {
      store.removeItem(DRAFT_KEY);
      return [];
    }
    return sanitize(parsed.items);
  } catch {
    store.removeItem(DRAFT_KEY);
    return [];
  }
}

export function saveMealDraft(date: string, items: FoodLogItem[]): void {
  const store = storage();
  if (!store) return;
  if (!items.length) {
    store.removeItem(DRAFT_KEY);
    return;
  }
  const draft: StoredDraft = { date, items };
  try {
    store.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Si el almacenamiento está lleno o bloqueado, la app sigue funcionando
    // con el estado en memoria.
  }
}

export function clearMealDraft(): void {
  storage()?.removeItem(DRAFT_KEY);
}
