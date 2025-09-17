import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'light' | 'dark';
type ThemeCtx = { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void; };

const ThemeContext = createContext<ThemeCtx | null>(null);
const storageKey = 'theme';

function readDomTheme(): Theme | null {
  try {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  } catch { return null; }
}

function getInitialTheme(): Theme {
  // 1) Si el DOM ya tiene clase (por snippet temprano en index.html), úsala
  const dom = readDomTheme();
  if (dom) return dom;
  // 2) Si hay guardado por el usuario, respétalo
  const saved = (localStorage.getItem(storageKey) as Theme | null);
  if (saved === 'light' || saved === 'dark') return saved;
  // 3) Sino, preferencia del sistema
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  // Mantén DOM y storage sincronizados
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem(storageKey, theme);
  }, [theme]);

  // (Opcional) si cambia la preferencia del sistema y NO hay elección guardada explícita
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem(storageKey);
      if (saved !== 'light' && saved !== 'dark') {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const api = useMemo<ThemeCtx>(() => ({
    theme,
    setTheme,
    toggle: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')),
  }), [theme]);

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
