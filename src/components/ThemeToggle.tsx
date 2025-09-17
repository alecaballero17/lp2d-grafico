// src/components/ThemeToggle.tsx
import React from 'react';
import { useTheme } from '../theme/ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="px-3 py-2 rounded-lg border
                 bg-white text-slate-800 border-slate-300
                 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
    >
      {theme === 'dark' ? '🌙 Oscuro' : '☀️ Claro'}
    </button>
  );
}
