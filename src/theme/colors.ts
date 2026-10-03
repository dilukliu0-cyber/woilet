export type ThemeName = 'dark' | 'light';

// The interface uses only pure black and pure white in both themes.
const darkPalette = {
  background: '#000000',
  surface: '#000000',
  surfaceElevated: '#000000',
  border: '#FFFFFF',
  cardBorder: '#FFFFFF',
  accent: '#FFFFFF',
  accentSoft: '#000000',
  warning: '#FFFFFF',
  error: '#FFFFFF',
  success: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#FFFFFF',
  textTertiary: '#FFFFFF',
};

const lightPalette: typeof darkPalette = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#000000',
  cardBorder: '#000000',
  accent: '#000000',
  accentSoft: '#FFFFFF',
  warning: '#000000',
  error: '#000000',
  success: '#000000',
  textPrimary: '#000000',
  textSecondary: '#000000',
  textTertiary: '#000000',
};

// Keep the object stable because styles and components read it at render time.
export const colors = { ...darkPalette };

let currentTheme: ThemeName = 'dark';

export function applyTheme(theme: ThemeName) {
  currentTheme = theme;
  Object.assign(colors, theme === 'light' ? lightPalette : darkPalette);
}

export function getCurrentTheme(): ThemeName {
  return currentTheme;
}

export function getCategoryColor(_name: string): string {
  return colors.accent;
}

export function progressColor(_percent: number): string {
  return colors.accent;
}
