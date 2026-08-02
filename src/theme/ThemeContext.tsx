import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { getStoredThemePreference, setStoredThemePreference } from '../utils/themeStorage';
import { darkColors, lightColors, type ThemeColors } from './colors';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  colorScheme: ColorScheme;
  colors: ThemeColors;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    getStoredThemePreference().then((stored) => {
      if (isThemePreference(stored)) {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    setStoredThemePreference(next);
  };

  const colorScheme: ColorScheme = preference === 'system' ? systemColorScheme ?? 'light' : preference;
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  const value = useMemo(
    () => ({ preference, colorScheme, colors, setPreference }),
    [preference, colorScheme, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
