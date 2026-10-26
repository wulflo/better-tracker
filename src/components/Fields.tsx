import React from 'react';

export function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  className = '',
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      className={`input ${className}`}
      type="number"
      inputMode="decimal"
      value={value === 0 ? '' : value}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => {
        if (e.target.value === '') {
          onChange(0);
          return;
        }
        const n = Number(e.target.value);
        if (!Number.isFinite(n)) return;
        onChange(n);
      }}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  sub,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  caption,
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value-lg">{value}</div>
      {caption && <div className="metric-caption">{caption}</div>}
    </div>
  );
}
