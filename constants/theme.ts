import { Platform, StyleSheet } from "react-native";

// ---------- Palettes ----------
export interface Palette {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  ready: string;
  readyBg: string;
  warn: string;
  warnBg: string;
  fault: string;
  faultBg: string;
  accent: string;
}

export const nightPalette: Palette = {
  bg: '#0B0E11',
  surface: '#141A20',
  surfaceRaised: '#1A222A',
  border: '#1E262E',
  borderStrong: '#2A343E',
  textPrimary: '#E8EDF2',
  textSecondary: '#8B9AA8',
  textMuted: '#5A6B7A',
  ready: '#30D158',
  readyBg: '#0F1A12',
  warn: '#FF9F0A',
  warnBg: '#1F1608',
  fault: '#E5484D',
  faultBg: '#1A1113',
  accent: '#3A8FCC',
};

// Tuned for sunlight readability — not a naive inversion of nightPalette.
// Status colours in particular are darkened so they stay legible on a light
// background instead of washing out.
export const dayPalette: Palette = {
  bg: '#E8EBED',
  surface: '#F5F7F8',
  surfaceRaised: '#FFFFFF',
  border: '#C5CDD3',
  borderStrong: '#A3AEB6',
  textPrimary: '#0B0E11',
  textSecondary: '#3D4954',
  textMuted: '#6B7883',
  ready: '#0F7B2E',
  readyBg: '#DCEFE1',
  warn: '#8A5200',
  warnBg: '#F7ECD9',
  fault: '#B3161B',
  faultBg: '#F7DEDF',
  accent: '#1A5F94',
};

// ---------- Palette-independent tokens ----------
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { none: 0, sm: 2, md: 4 };

export const type = {
  fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }),
  micro: 9, // micro-labels: uppercase, letterSpacing 1.5, textMuted
  xs: 11,
  sm: 13,
  md: 15,
  lg: 20,
  xl: 24,
  readout: 30, // numeric readouts: textPrimary
};

// Appends an alpha channel to a 6-digit hex token, e.g. alpha(palette.ready, 0.12)
// for a tinted status/button background. Keeps every hex value confined to the
// palettes above instead of consumers writing rgba()/hex literals of their own.
export function alpha(hex: string, opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  const channel = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${channel}`;
}

// ---------- Shared cross-screen primitives, built per-palette ----------
export function createStyles(palette: Palette) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    bodyContainer: {
      flex: 1,
      padding: spacing.lg,
    },
    label: {
      fontFamily: type.fontFamily,
      fontSize: type.lg,
      color: palette.textPrimary,
      letterSpacing: 1,
      textTransform: "uppercase" as const,
      marginBottom: spacing.lg,
      textAlign: 'left' as const,
      writingDirection: 'ltr' as const,
    },
    cardWrapper: {
      marginVertical: spacing.sm,
      width: "100%" as const,
      height: 200,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: palette.border,
      overflow: "hidden" as const,
    },
    cardImage: {
      flex: 1,
      justifyContent: "flex-end" as const,
    },
    cardOverlay: {
      padding: spacing.md,
      backgroundColor: alpha(palette.bg, 0.78),
    },
    cardTitle: {
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.lg,
      fontWeight: "bold" as const,
      textAlign: 'left' as const,
      writingDirection: 'ltr' as const,
    },
    cardSubtitle: {
      fontFamily: type.fontFamily,
      color: palette.textSecondary,
      fontSize: type.sm,
      marginTop: spacing.xs / 2,
      textAlign: 'left' as const,
      writingDirection: 'ltr' as const,
    },
  });
}

// Default export built from nightPalette so nothing breaks mid-refactor. Every
// screen has moved to useTheme() from contexts/ThemeContext.tsx — nothing in
// app/ or components/ should import this anymore.
export const styles = createStyles(nightPalette);

// ---------- Legacy exports ----------
// Kept for hooks/use-theme-color.ts and components/ui/collapsible.tsx, which sit
// outside the app/ screens this theme system covers and are not part of this task.
const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";

export const Colors = {
  light: {
    text: "#11181C",
    background: "#fff",
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#ECEDEE",
    background: "#151718",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
