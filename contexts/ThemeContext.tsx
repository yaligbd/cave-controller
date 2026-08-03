import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { createStyles, dayPalette, nightPalette, Palette } from '@/constants/theme';

export type ThemeMode = 'night' | 'day';

const STORAGE_KEY = 'cavebat.theme';

interface ThemeContextType {
  mode: ThemeMode;
  palette: Palette;
  styles: ReturnType<typeof createStyles>;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Render with the default immediately — the saved mode (if any) is applied
  // once AsyncStorage resolves, not blocked on.
  const [mode, setModeState] = useState<ThemeMode>('night');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'day' || saved === 'night') {
          setModeState(saved);
        }
      })
      .catch((error) => {
        console.warn('[theme] Failed to load saved theme mode:', error);
      });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch((error) => {
      console.warn('[theme] Failed to persist theme mode:', error);
    });
  };

  const toggleMode = () => {
    setMode(mode === 'night' ? 'day' : 'night');
  };

  const palette = mode === 'day' ? dayPalette : nightPalette;
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <ThemeContext.Provider value={{ mode, palette, styles, toggleMode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
