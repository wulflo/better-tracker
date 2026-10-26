import React, { useEffect, useMemo, useState } from 'react';
import type { Food, FoodCategory, FoodLogItem, MealSlot } from '../types';
import {
  FOOD_CATEGORIES,
  MEAL_SLOTS,
  calcFood,
  categoryLabel,
  defaultQuantity,
  foodUnits,
  mealTotals,
  searchFoods,
  unitLabel,
} from '../foodDb';
import Select from './Select';
import { NumberInput } from './Fields';
import { Icon } from './Icons';

interface Props {
  foods: Food[];
  items: FoodLogItem[];
  onAdd: (item: FoodLogItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCreateFood: (food: Food) => Promise<void>;
}

function preferredUnit(food: Food): string {
  const units = foodUnits(food);
  if (units.includes('ml') && ['bebida', 'lacteo', 'grasa', 'condimento'].includes(food.category)) {
    return 'ml';
  }
  return 'g';
}

export default function FoodLog({ foods, items, onAdd, onRemove, onClear, onCreateFood }: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(foods[0]?.id ?? '');
  const [quantity, setQuantity] = useState(100);
  const [unit, setUnit] = useState('g');
  const [meal, setMeal] = useState<MealSlot>('desayuno');
  const [customOpen, setCustomOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState({
    name: '',
    category: 'otro' as FoodCategory,
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    unitGrams: 0,
  });

  const selected = foods.find((food) => food.id === selectedId) ?? null;
  const units = selected ? foodUnits(selected) : ['g'];
  const preview = selected ? calcFood(selected, quantity, unit) : null;
  const totals = mealTotals(items);
  const results = useMemo(() => searchFoods(foods, query, 8), [foods, query]);

  useEffect(() => {
    if (foods.some((food) => food.id === selectedId)) return;
    const first = foods[0];
    if (first) {
      setSelectedId(first.id);
      setUnit(preferredUnit(first));
      setQuantity(defaultQuantity(preferredUnit(first)));
    }
  }, [foods, selectedId]);

  const chooseFood = (food: Food) => {
    setSelectedId(food.id);
    const nextUnit = preferredUnit(food);
    setUnit(nextUnit);
    setQuantity(defaultQuantity(nextUnit));
    setQuery('');
  };

  const changeUnit = (nextUnit: string) => {
    setUnit(nextUnit);
    setQuantity(defaultQuantity(nextUnit));
  };

  const add = () => {
    if (!selected || !preview) return;
    onAdd({
      id: crypto.randomUUID(),
      foodId: selected.id,
      name: selected.name,
      category: selected.category,
      meal,
      quantity,
      unit,
      grams: preview.grams,
      kcal: preview.kcal,
      protein: preview.protein,
      carbs: preview.carbs,
      fat: preview.fat,
      fiber: preview.fiber,
    });
  };

  const createCustom = async () => {
    setError('');
    if (!custom.name.trim()) {
      setError('Escribe el nombre del alimento.');
      return;
    }
    if (custom.kcal < 0 || custom.protein < 0 || custom.carbs < 0 || custom.fat < 0 || custom.fiber < 0) {
      setError('Los valores no pueden ser negativos.');
      return;
    }
    setSaving(true);
    try {
      const food: Food = {
        id: `custom-${crypto.randomUUID()}`,
        name: custom.name.trim(),
        category: custom.category,
        per100: {
          kcal: custom.kcal,
          protein: custom.protein,
          carbs: custom.carbs,
          fat: custom.fat,
          fiber: custom.fiber,
        },
        units: custom.unitGrams > 0 ? { unidad: custom.unitGrams } : {},
        custom: true,
      };
      await onCreateFood(food);
      setCustom({
        name: '',
        category: 'otro',
        kcal: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        unitGrams: 0,
      });
      setCustomOpen(false);
      setQuery(food.name);
    } catch {
      setError('No se pudo guardar el alimento. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-log">
      <div className="food-search">
        <span className="field-label">Buscar alimento</span>
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`${foods.length} alimentos: pollo, arroz, plátano...`}
          aria-label="Buscar alimento"
        />
        <div className="food-results" role="listbox" aria-label="Resultados de alimentos">
          {results.length === 0 ? (
            <div className="food-result-empty">
              No hay coincidencias. Puedes añadir este alimento con el formulario de abajo.
            </div>
          ) : (
            results.map((food) => (
              <button
                key={food.id}
                type="button"
                className={`food-result ${selected?.id === food.id ? 'active' : ''}`}
                onClick={() => chooseFood(food)}
              >
                <span>
                  <strong>{food.name}</strong>
                  <span className="small muted"> · {categoryLabel(food.category)}</span>
                </span>
                <span className="mono small">{food.per100.kcal} kcal/100 g</span>
              </button>
            ))
          )}
        </div>
      </div>

      {selected && preview && (
        <div className="food-preview">
          <div className="food-preview-head">
            <div>
              <strong>{selected.name}</strong>
              <div className="small muted">
                {selected.per100.kcal} kcal · {selected.per100.protein} g proteína · {selected.per100.carbs} g carbohidratos ·{' '}
                {selected.per100.fat} g grasas por 100 g
              </div>
            </div>
            <span className="badge badge-primary">{categoryLabel(selected.category)}</span>
          </div>
          <div className="food-add-row">
            <label className="field">
              <span className="field-label">Comida</span>
              <Select
                value={meal}
                onChange={(value) => setMeal(value as MealSlot)}
                options={MEAL_SLOTS.map((slot) => ({ value: slot.id, label: slot.label }))}
              />
            </label>
            <label className="field">
              <span className="field-label">Cantidad</span>
              <NumberInput value={quantity} onChange={setQuantity} min={0} step={unit === 'g' || unit === 'ml' ? 10 : 0.5} />
            </label>
            <label className="field">
              <span className="field-label">Medida</span>
              <Select
                value={unit}
                onChange={changeUnit}
                options={units.map((item) => ({ value: item, label: unitLabel(item) }))}
              />
            </label>
            <button type="button" className="btn btn-primary btn-sm food-add-button" onClick={add}>
              <Icon name="plus" size={14} /> Añadir
            </button>
          </div>
          <div className="food-preview-totals">
            <span><strong>{preview.grams} g</strong> aprox.</span>
            <span><strong>{preview.kcal} kcal</strong></span>
            <span>P {preview.protein} g</span>
            <span>C {preview.carbs} g</span>
            <span>G {preview.fat} g</span>
            <span>Fibra {preview.fiber} g</span>
          </div>
        </div>
      )}

      <div className="food-day">
        <div className="row between wrap">
          <div>
            <span className="field-label">Comidas de hoy</span>
            <span className="hint"> Borrador efímero: se borra al terminar el día.</span>
          </div>
          {items.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
              <Icon name="trash" size={14} /> Vaciar
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="food-empty">Añade alimentos para estimar la ingesta del día. Después podrás guardar un único log diario.</div>
        ) : (
          <div className="stack-sm">
            {MEAL_SLOTS.map((slot) => {
              const group = items.filter((item) => item.meal === slot.id);
              if (!group.length) return null;
              return (
                <div key={slot.id} className="meal-group">
                  <div className="meal-heading">{slot.label}</div>
                  {group.map((item) => (
                    <div key={item.id} className="food-item">
                      <div className="food-item-main">
                        <strong>{item.name}</strong>
                        <span className="small muted">
                          {item.quantity} {unitLabel(item.unit)} · {item.grams} g
                        </span>
                      </div>
                      <div className="food-item-macros">
                        <strong>{item.kcal} kcal</strong>
                        <span>P {item.protein} · C {item.carbs} · G {item.fat}</span>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Quitar ${item.name}`}
                        onClick={() => onRemove(item.id)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <div className="food-totals">
            <div><span>Calorías</span><strong>{totals.kcal} kcal</strong></div>
            <div><span>Proteína</span><strong>{totals.protein} g</strong></div>
            <div><span>Carbohidratos</span><strong>{totals.carbs} g</strong></div>
            <div><span>Grasas</span><strong>{totals.fat} g</strong></div>
            <div><span>Fibra</span><strong>{totals.fiber} g</strong></div>
          </div>
        )}
      </div>

      <div className="food-custom">
        <button type="button" className="btn btn-tonal btn-sm" onClick={() => setCustomOpen((open) => !open)}>
          <Icon name="plus" size={14} /> {customOpen ? 'Cerrar' : 'Añadir alimento a la base'}
        </button>
        {customOpen && (
          <div className="food-custom-form">
            <div className="grid grid-2" style={{ gap: 10 }}>
              <label className="field">
                <span className="field-label">Nombre</span>
                <input
                  className="input"
                  value={custom.name}
                  onChange={(event) => setCustom({ ...custom, name: event.target.value })}
                  placeholder="Ej. tortilla casera"
                />
              </label>
              <label className="field">
                <span className="field-label">Categoría</span>
                <Select
                  value={custom.category}
                  onChange={(value) => setCustom({ ...custom, category: value as FoodCategory })}
                  options={FOOD_CATEGORIES.map((category) => ({ value: category.id, label: category.label }))}
                />
              </label>
              <label className="field">
                <span className="field-label">Calorías / 100 g</span>
                <NumberInput value={custom.kcal} onChange={(value) => setCustom({ ...custom, kcal: value })} min={0} />
              </label>
              <label className="field">
                <span className="field-label">Proteína / 100 g</span>
                <NumberInput value={custom.protein} onChange={(value) => setCustom({ ...custom, protein: value })} min={0} step={0.1} />
              </label>
              <label className="field">
                <span className="field-label">Carbohidratos / 100 g</span>
                <NumberInput value={custom.carbs} onChange={(value) => setCustom({ ...custom, carbs: value })} min={0} step={0.1} />
              </label>
              <label className="field">
                <span className="field-label">Grasas / 100 g</span>
                <NumberInput value={custom.fat} onChange={(value) => setCustom({ ...custom, fat: value })} min={0} step={0.1} />
              </label>
              <label className="field">
                <span className="field-label">Fibra / 100 g</span>
                <NumberInput value={custom.fiber} onChange={(value) => setCustom({ ...custom, fiber: value })} min={0} step={0.1} />
              </label>
              <label className="field">
                <span className="field-label">Peso de 1 unidad (g, opcional)</span>
                <NumberInput value={custom.unitGrams} onChange={(value) => setCustom({ ...custom, unitGrams: value })} min={0} step={1} />
              </label>
            </div>
            {error && <div className="notice notice-error"><Icon name="alert" size={16} /><span>{error}</span></div>}
            <div className="row between">
              <span className="hint">Se guarda en la bóveda local y estará disponible en el buscador.</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void createCustom()} disabled={saving}>
                <Icon name="check" size={14} /> {saving ? 'Guardando…' : 'Guardar alimento'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
