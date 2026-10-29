import React, { useEffect, useMemo, useState } from 'react';
import type { Food, FoodCategory, FoodLogItem, MealSlot } from '../types';
import {
  FOOD_CATEGORIES,
  MEAL_SLOTS,
  calcFood,
  categoryLabel,
  defaultQuantity,
  findFoodByBarcode,
  foodUnits,
  mealTotals,
  normalizeBarcode,
  resizeFoodLogItem,
  searchFoods,
  unitLabel,
} from '../foodDb';
import { lookupBarcode } from '../vault';
import { lookupBarcodeCatalog } from '../barcodeCatalog';
import { errorText } from '../errors';
import Select from './Select';
import { NumberInput } from './Fields';
import { Icon } from './Icons';
import BarcodeScanner from './BarcodeScanner';

interface Props {
  foods: Food[];
  items: FoodLogItem[];
  onAdd: (item: FoodLogItem) => void;
  onUpdate: (item: FoodLogItem) => void;
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

export default function FoodLog({ foods, items, onAdd, onUpdate, onRemove, onClear, onCreateFood }: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(foods[0]?.id ?? '');
  const [quantity, setQuantity] = useState(100);
  const [unit, setUnit] = useState('g');
  const [meal, setMeal] = useState<MealSlot>('desayuno');
  const [customOpen, setCustomOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editUnit, setEditUnit] = useState('g');
  const [editMeal, setEditMeal] = useState<MealSlot>('desayuno');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [scannedFood, setScannedFood] = useState<Food | null>(null);
  const [custom, setCustom] = useState({
    name: '',
    category: 'otro' as FoodCategory,
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    unitGrams: 0,
    barcode: '',
  });

  const selected = foods.find((food) => food.id === selectedId)
    ?? (scannedFood?.id === selectedId ? scannedFood : null);
  const units = selected ? foodUnits(selected) : ['g'];
  const preview = selected ? calcFood(selected, quantity, unit) : null;
  const totals = mealTotals(items);
  const results = useMemo(() => searchFoods(foods, query, 8), [foods, query]);

  const foodFor = (item: FoodLogItem): Food | undefined =>
    foods.find((food) => food.id === item.foodId)
    ?? (scannedFood?.id === item.foodId ? scannedFood : undefined);

  useEffect(() => {
    if (foods.some((food) => food.id === selectedId)) return;
    if (scannedFood && scannedFood.id === selectedId) return;
    const first = foods[0];
    if (first) {
      setSelectedId(first.id);
      setUnit(preferredUnit(first));
      setQuantity(defaultQuantity(preferredUnit(first)));
    }
  }, [foods, selectedId, scannedFood]);

  const chooseFood = (food: Food) => {
    setSelectedId(food.id);
    const nextUnit = preferredUnit(food);
    setUnit(nextUnit);
    setQuantity(defaultQuantity(nextUnit));
    setQuery(food.name);
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

  const startEdit = (item: FoodLogItem) => {
    setEditingId(item.id);
    setEditQuantity(item.quantity);
    setEditUnit(item.unit);
    setEditMeal(item.meal);
  };

  const saveEdit = (item: FoodLogItem) => {
    onUpdate(resizeFoodLogItem(item, foodFor(item), editQuantity, editUnit, editMeal));
    setEditingId(null);
  };

  const handleBarcode = async (raw: string) => {
    const code = normalizeBarcode(raw);
    setScannerOpen(false);
    if (!code) {
      setError('El lector no devolvió un código válido.');
      return;
    }
    setError('');

    const local = findFoodByBarcode(foods, code);
    if (local) {
      chooseFood(local);
      setScanNotice(`Producto ya guardado: ${local.name} (${code}).`);
      return;
    }

    setScanBusy(true);
    setScanNotice(`Buscando el código ${code} en el catálogo local…`);
    try {
      // 1) Catálogo local AR/PE/MX: disponible sin conexión. Los macros son
      // una aproximación por categoría, así que se avisa en el resultado.
      const catalogFood = await lookupBarcodeCatalog(code);
      if (catalogFood) {
        setScannedFood(catalogFood);
        await onCreateFood(catalogFood);
        chooseFood(catalogFood);
        setScanNotice(
          `Producto del catálogo local: ${catalogFood.name}. Macros estimados por categoría; ajusta la cantidad o edítalo con la etiqueta si necesitas precisión.`,
        );
        return;
      }

      // 2) Open Food Facts: datos exactos si el producto existe y hay red.
      setScanNotice(`Buscando el código ${code} en Open Food Facts…`);
      const product = await lookupBarcode(code);
      if (product) {
        setScannedFood(product);
        await onCreateFood(product);
        chooseFood(product);
        setScanNotice(`Producto encontrado y guardado en tu base: ${product.name}.`);
      } else {
        setCustom((value) => ({ ...value, barcode: code }));
        setCustomOpen(true);
        setScanNotice(
          `El código ${code} no está en el catálogo local ni en Open Food Facts o no tiene macros. Revisa la etiqueta y guárdalo manualmente: el código quedará asociado.`,
        );
      }
    } catch (e) {
      setCustom((value) => ({ ...value, barcode: code }));
      setCustomOpen(true);
      setScanNotice(`No se pudo consultar el producto (${errorText(e)}). Puedes guardarlo manualmente con este código.`);
    } finally {
      setScanBusy(false);
    }
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
    const barcode = normalizeBarcode(custom.barcode);
    if (barcode && findFoodByBarcode(foods, barcode)) {
      setError('Ya existe un alimento con ese código de barras.');
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
        barcode: barcode || undefined,
        source: 'manual',
      };
      await onCreateFood(food);
      setScannedFood(food);
      setSelectedId(food.id);
      setUnit(preferredUnit(food));
      setQuantity(defaultQuantity(preferredUnit(food)));
      setCustom({
        name: '',
        category: 'otro',
        kcal: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        unitGrams: 0,
        barcode: '',
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
        <div className="food-search-row">
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${foods.length} alimentos: pollo, arroz, plátano...`}
            aria-label="Buscar alimento"
          />
          <button
            type="button"
            className="btn btn-tonal btn-sm food-scan-button"
            onClick={() => {
              setScanNotice(null);
              setScannerOpen(true);
            }}
            disabled={scanBusy}
          >
            <Icon name="scan" size={15} /> {scanBusy ? 'Buscando…' : 'Escanear código'}
          </button>
        </div>
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
                  {food.barcode && <span className="small muted mono"> · {food.barcode}</span>}
                </span>
                <span className="mono small">{food.per100.kcal} kcal/100 g</span>
              </button>
            ))
          )}
        </div>
        {scanNotice && (
          <div className="notice notice-info food-scan-notice">
            <Icon name="scan" size={16} />
            <span>{scanNotice}</span>
          </div>
        )}
      </div>

      {selected && preview && (
        <div className="food-preview">
          <div className="food-preview-head">
            <div>
              <strong>{selected.name}</strong>
              <div className="small muted">
                {selected.per100.kcal} kcal · {selected.per100.protein} g proteína · {selected.per100.carbs} g carbohidratos ·{' '}
                {selected.per100.fat} g grasas por 100 g
                {selected.barcode ? ` · código ${selected.barcode}` : ''}
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
                  {group.map((item) => {
                    if (item.id === editingId) {
                      const itemFood = foodFor(item);
                      const itemUnits = itemFood ? foodUnits(itemFood) : ['g'];
                      const unitOptions = itemUnits.includes(item.unit) ? itemUnits : [item.unit, ...itemUnits];
                      const editPreview = itemFood ? calcFood(itemFood, editQuantity, editUnit) : null;
                      return (
                        <div key={item.id} className="food-item food-item-edit">
                          <div className="food-item-main">
                            <strong>{item.name}</strong>
                            <span className="small muted">
                              {editPreview ? `${editPreview.grams} g · ${editPreview.kcal} kcal` : 'Sin datos del alimento'}
                            </span>
                          </div>
                          <div className="food-edit-grid">
                            <label className="field">
                              <span className="field-label">Comida</span>
                              <Select
                                value={editMeal}
                                onChange={(value) => setEditMeal(value as MealSlot)}
                                options={MEAL_SLOTS.map((option) => ({ value: option.id, label: option.label }))}
                              />
                            </label>
                            <label className="field">
                              <span className="field-label">Cantidad</span>
                              <NumberInput
                                value={editQuantity}
                                onChange={setEditQuantity}
                                min={0}
                                step={editUnit === 'g' || editUnit === 'ml' ? 10 : 0.5}
                              />
                            </label>
                            <label className="field">
                              <span className="field-label">Medida</span>
                              <Select
                                value={editUnit}
                                onChange={(value) => {
                                  setEditUnit(value);
                                  setEditQuantity(defaultQuantity(value));
                                }}
                                options={unitOptions.map((option) => ({ value: option, label: unitLabel(option) }))}
                              />
                            </label>
                          </div>
                          <div className="food-edit-actions">
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => saveEdit(item)}>
                              <Icon name="check" size={14} /> Guardar
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
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
                        <div className="food-item-actions">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Editar ${item.name}`}
                            onClick={() => startEdit(item)}
                          >
                            <Icon name="edit" size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-button icon-button-danger"
                            aria-label={`Quitar ${item.name}`}
                            onClick={() => onRemove(item.id)}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
              <label className="field">
                <span className="field-label">Código de barras (opcional)</span>
                <input
                  className="input"
                  value={custom.barcode}
                  onChange={(event) => setCustom({ ...custom, barcode: event.target.value })}
                  placeholder="Ej. 8412345678905"
                  inputMode="numeric"
                />
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

      {scannerOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Escanear código de barras">
          <div className="modal" style={{ width: 'min(520px, 100%)' }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Escanear producto</div>
                <div className="card-sub">EAN/UPC del envase. Se busca primero en tu base y en el catálogo local AR/PE/MX; si no aparece, podrás crearlo manualmente.</div>
              </div>
              <button className="btn-icon" aria-label="Cerrar escáner" onClick={() => setScannerOpen(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <BarcodeScanner
                onResult={(code) => void handleBarcode(code)}
                onClose={() => setScannerOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
