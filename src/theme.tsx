import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light';
export type Accent =
  | 'violet'
  | 'blue'
  | 'teal'
  | 'green'
  | 'amber'
  | 'orange'
  | 'red'
  | 'pink'
  | 'indigo';

export interface AccentOption {
  id: Accent;
  labelEs: string;
  labelEn: string;
  color: string;
}

/** Variantes de acento disponibles en Ajustes. */
export const ACCENTS: AccentOption[] = [
  { id: 'violet', labelEs: 'Violeta', labelEn: 'Violet', color: '#8f6fe8' },
  { id: 'blue', labelEs: 'Azul', labelEn: 'Blue', color: '#4f8ef7' },
  { id: 'teal', labelEs: 'Turquesa', labelEn: 'Teal', color: '#2b9d8f' },
  { id: 'green', labelEs: 'Verde', labelEn: 'Green', color: '#3aa876' },
  { id: 'amber', labelEs: 'Ámbar', labelEn: 'Amber', color: '#d99a1b' },
  { id: 'orange', labelEs: 'Naranja', labelEn: 'Orange', color: '#e07b32' },
  { id: 'red', labelEs: 'Rojo', labelEn: 'Red', color: '#e5484d' },
  { id: 'pink', labelEs: 'Rosa', labelEn: 'Pink', color: '#e0579a' },
  { id: 'indigo', labelEs: 'Índigo', labelEn: 'Indigo', color: '#6366f1' },
];

const MODE_KEY = 'bt.theme';
const ACCENT_KEY = 'bt.accent';

function readMode(): ThemeMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function readAccent(): Accent {
  try {
    const value = localStorage.getItem(ACCENT_KEY);
    return ACCENTS.some((accent) => accent.id === value) ? (value as Accent) : 'violet';
  } catch {
    return 'violet';
  }
}

/** Aplica el tema al documento y actualiza el color de la barra del sistema. */
export function applyTheme(mode: ThemeMode, accent: Accent) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.dataset.accent = accent;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    // El color de la barra del sistema sigue al fondo real del acento activo.
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    meta.setAttribute('content', bg || (mode === 'dark' ? '#130f1b' : '#f7f4fb'));
  }
}

// Se aplica al importar el módulo para que el primer pintado ya use el tema
// guardado (el script de `index.html` hace lo mismo antes de cargar React).
const initialMode = readMode();
const initialAccent = readAccent();
applyTheme(initialMode, initialAccent);

interface ThemeCtx {
  mode: ThemeMode;
  accent: Accent;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: Accent) => void;
}

const Ctx = createContext<ThemeCtx>({
  mode: 'dark',
  accent: 'violet',
  setMode: () => {},
  setAccent: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [accent, setAccent] = useState<Accent>(initialAccent);

  useEffect(() => {
    applyTheme(mode, accent);
    try {
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(ACCENT_KEY, accent);
    } catch {
      // Sin almacenamiento el tema sigue funcionando durante la sesión.
    }
  }, [mode, accent]);

  return <Ctx.Provider value={{ mode, accent, setMode, setAccent }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}
