import React, { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'es' | 'en';

const STORAGE_KEY = 'bt.lang';

const DICT: Record<Lang, Record<string, string>> = {
  es: {
    'app.subtitle': 'Entrena local, entiende tu cuerpo',
    'nav.panel': 'Panel',
    'nav.training': 'Entrenamiento',
    'nav.history': 'Historial',
    'nav.body': 'Figura corporal',
    'nav.wellness': 'Hábitos',
    'nav.mobile.panel': 'Panel',
    'nav.mobile.training': 'Entreno',
    'nav.mobile.history': 'Historial',
    'nav.mobile.body': 'Cuerpo',
    'nav.mobile.wellness': 'Hábitos',
    'settings': 'Ajustes y bóveda',
    'language': 'Idioma',
  },
  en: {
    'app.subtitle': 'Train locally, understand your body',
    'nav.panel': 'Dashboard',
    'nav.training': 'Training',
    'nav.history': 'History',
    'nav.body': 'Body',
    'nav.wellness': 'Habits',
    'nav.mobile.panel': 'Dashboard',
    'nav.mobile.training': 'Train',
    'nav.mobile.history': 'History',
    'nav.mobile.body': 'Body',
    'nav.mobile.wellness': 'Habits',
    'settings': 'Settings and vault',
    'language': 'Language',
  },
};

export function t(key: string, lang: Lang): string {
  return DICT[lang]?.[key] ?? DICT.es[key] ?? key;
}

interface LanguageCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LanguageCtx>({ lang: 'es', setLang: () => {} });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'en' ? 'en' : 'es';
    } catch {
      return 'es';
    }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = (l: Lang) => setLangState(l);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLanguage(): LanguageCtx {
  return useContext(Ctx);
}
