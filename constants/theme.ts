import { useRef } from "react";
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

  // --- depth and sheen ---
  // A flat fill reads as a 2005 control panel however good the colours are.
  // Every raised thing in the app is drawn as a two-stop vertical gradient
  // instead, lit from the top, so a card looks like a surface catching light
  // rather than a rectangle of paint.
  /** Top and bottom of a card/panel fill. */
  gradSurface: [string, string];
  /** Top and bottom of a primary action fill. */
  gradAccent: [string, string];
  /** Behind the whole screen, so the background is not one dead tone. */
  gradBackdrop: [string, string];
  /** Translucent pane colour for the glass look — layered over content. */
  glass: string;
  /** The hairline along the top edge of a glass pane that sells it as glass. */
  glassEdge: string;
  /** Colour of cast shadows. Black at night, the ink colour by day. */
  shadowColor: string;
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

  gradSurface: ['#1B242D', '#131A20'],
  gradAccent: ['#4A9FDC', '#2A6E9E'],
  gradBackdrop: ['#0E1318', '#080A0D'],
  glass: 'rgba(31, 42, 53, 0.72)',
  glassEdge: 'rgba(255, 255, 255, 0.10)',
  shadowColor: '#000000',
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

  gradSurface: ['#FFFFFF', '#EFF3F5'],
  gradAccent: ['#2E86C4', '#17537F'],
  gradBackdrop: ['#F2F5F7', '#DDE3E7'],
  glass: 'rgba(255, 255, 255, 0.72)',
  glassEdge: 'rgba(255, 255, 255, 0.85)',
  shadowColor: '#2A3A47',
};

// ---------- Palette-independent tokens ----------
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Every screen already draws its corners from these three names, so widening
// the scale rounds the whole app at once. `xs` and `pill` are new, for the
// chips and bars that look wrong at card radius.
export const radius = { none: 0, xs: 8, sm: 14, md: 22, lg: 28, pill: 999 };

// Cast shadows, in the four strengths used. Android needs `elevation` and
// ignores the rest; iOS is the opposite, so both are always set. A shadow only
// renders over an opaque backgroundColor, which every raised surface has.
export type ShadowLevel = 'none' | 'sm' | 'md' | 'lg';

export function shadow(level: ShadowLevel, palette: Palette) {
  if (level === 'none') return {};
  const spec = {
    sm: { h: 2, o: 0.18, r: 6, e: 3 },
    md: { h: 6, o: 0.26, r: 14, e: 8 },
    lg: { h: 14, o: 0.38, r: 28, e: 18 },
  }[level];
  return {
    shadowColor: palette.shadowColor,
    shadowOffset: { width: 0, height: spec.h },
    shadowOpacity: spec.o,
    shadowRadius: spec.r,
    elevation: spec.e,
  };
}

export const type = {
  // Monospace for everything is what makes the app feel like a terminal. It
  // belongs on numbers that change in place — a readout that jitters sideways
  // as digits change is genuinely harder to read — and nowhere else. `mono` is
  // for those; `fontFamily` is the prose font that labels and buttons move to.
  fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }),
  mono: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }),
  sans: Platform.select({ android: 'sans-serif', ios: 'System', default: 'system-ui' }),
  sansMedium: Platform.select({ android: 'sans-serif-medium', ios: 'System', default: 'system-ui' }),
  micro: 9, // micro-labels: uppercase, letterSpacing 1.5, textMuted
  xs: 11,
  sm: 13,
  md: 15,
  lg: 20,
  xl: 24,
  xxl: 30,
  readout: 34, // numeric readouts: textPrimary, always type.mono
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

// A gradient inside an SVG is referenced by id, so two gradients sharing an id
// on the same screen render as one fill. React's own useId() produces strings
// containing colons, which are not valid in an SVG url(#...) reference, hence
// a plain counter.
let gradientSeq = 0;
export function useGradientId(): string {
  const ref = useRef<string | null>(null);
  if (ref.current === null) ref.current = `cbgrad${gradientSeq++}`;
  return ref.current;
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
    // The screen title. Large and in the prose font rather than small, spaced
    // and uppercase — an uppercase monospace heading is the single clearest
    // tell of the old look, and it was on every screen.
    label: {
      fontFamily: type.sansMedium,
      fontSize: type.xxl,
      fontWeight: '700' as const,
      color: palette.textPrimary,
      letterSpacing: -0.4,
      alignSelf: 'flex-start' as const,
      marginBottom: spacing.xs,
      textAlign: 'left' as const,
      writingDirection: 'ltr' as const,
    },
    cardWrapper: {
      marginVertical: spacing.sm,
      width: "100%" as const,
      height: 200,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: palette.border,
      overflow: "hidden" as const,
      ...shadow('md', palette),
    },
    cardImage: {
      flex: 1,
      justifyContent: "flex-end" as const,
    },
    cardOverlay: {
      padding: spacing.lg,
      backgroundColor: alpha(palette.bg, 0.72),
    },
    cardTitle: {
      fontFamily: type.sansMedium,
      color: palette.textPrimary,
      fontSize: type.xl,
      fontWeight: "700" as const,
      letterSpacing: -0.3,
      textAlign: 'left' as const,
      writingDirection: 'ltr' as const,
    },
    cardSubtitle: {
      fontFamily: type.sans,
      color: palette.textSecondary,
      fontSize: type.sm,
      marginTop: spacing.xs,
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
