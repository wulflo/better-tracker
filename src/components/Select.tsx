import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tx, useLanguage } from '../i18n';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  /** Muestra un campo de búsqueda dentro del menú. */
  searchable?: boolean;
  searchPlaceholder?: string;
}

export default function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className = '',
  searchable = false,
  searchPlaceholder,
}: Props) {
  const { lang } = useLanguage();
  const placeholderText = placeholder ?? tx(lang, 'Seleccionar', 'Select');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!searchable || !term) return options;
    return options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(term));
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    if (searchable) searchRef.current?.focus();
  }, [open, searchable]);

  useEffect(() => {
    if (open) {
      const idx = filteredOptions.findIndex((o) => o.value === value);
      setActive(idx >= 0 ? idx : 0);
    }
  }, [open, filteredOptions, value]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(filteredOptions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filteredOptions[active];
      if (opt) choose(opt.value);
    } else if (e.key === ' ' && !searchable) {
      e.preventDefault();
      const opt = filteredOptions[active];
      if (opt) choose(opt.value);
    }
  };

  return (
    <div ref={rootRef} className={`select ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          // Evita que un <label> contenedor reenvíe el clic al botón y lo
          // vuelva a abrir justo después de seleccionar una opción.
          e.preventDefault();
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? 'select-value' : 'select-placeholder'}>
          {selected ? selected.label : placeholderText}
        </span>
        <svg className={`select-chevron ${open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="select-menu" role="listbox" tabIndex={-1}>
          {searchable && (
            <div className="select-search">
              <input
                ref={searchRef}
                className="input input-sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder ?? tx(lang, 'Buscar...', 'Search...')}
                aria-label={searchPlaceholder ?? tx(lang, 'Buscar opciones', 'Search options')}
              />
            </div>
          )}
          {filteredOptions.length === 0 && (
            <div className="select-empty">{tx(lang, 'Sin opciones', 'No options')}</div>
          )}
          {filteredOptions.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`select-option ${opt.value === value ? 'selected' : ''} ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                choose(opt.value);
              }}
            >
              <span className="select-option-label">{opt.label}</span>
              {opt.hint && <span className="select-option-hint">{opt.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
