import { Palette, useGradientId } from '@/constants/theme';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * Split a CSS colour into an opaque colour and its alpha.
 *
 * THIS IS NOT A TIDY-UP, IT IS THE FIX FOR A REAL BUG. An SVG gradient stop
 * carries its colour and its opacity in two separate attributes, and
 * react-native-svg does not read the alpha out of a `rgba(...)` or `#RRGGBBAA`
 * string passed as `stopColor` -- it takes the colour and leaves opacity at 1.
 *
 * So a sheen written as rgba(255,255,255,0.22) -> rgba(255,255,255,0) rendered
 * as solid white at BOTH ends: an opaque white block over every button and
 * status panel in the app, with the label invisible underneath it. Alpha has to
 * be lifted out here and handed to `stopOpacity` instead.
 */
function splitAlpha(colour: string): [string, number] {
  const hex8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(colour);
  if (hex8) return [`#${hex8[1]}`, parseInt(hex8[2], 16) / 255];

  const rgba = /^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/i.exec(colour);
  if (rgba) {
    const a = Number(rgba[4]);
    return [`rgb(${rgba[1]},${rgba[2]},${rgba[3]})`, Number.isFinite(a) ? a : 1];
  }

  return [colour, 1];
}

/**
 * A two-stop gradient that fills whatever it is placed inside.
 *
 * WHY SVG AND NOT expo-linear-gradient. That package contains native code, so
 * adding it would mean rebuilding the dev client -- and this app's dev client is
 * the one that carries the BLE module. react-native-svg is already in the build
 * and draws the same thing, so the whole visual refresh costs no rebuild and
 * cannot disturb the radio.
 *
 * USE IT SPARINGLY. Each instance is a whole SVG document, and on Android a
 * large one near the 3D WebView makes it stutter. It belongs on small, bounded
 * things -- a button, a badge, a sheet -- never behind a whole screen and never
 * once per cell in a grid that updates at 10Hz.
 *
 * Place it as the first child of a view with `overflow: 'hidden'` and a
 * borderRadius; it sits behind the real children and takes their corners.
 */
function GradientImpl({
  colors,
  /** 'down' for a lit-from-above surface, 'diagonal' for a sheen across glass. */
  direction = 'down',
  style,
  opacity = 1,
}: {
  colors: readonly [string, string];
  direction?: 'down' | 'diagonal';
  style?: ViewStyle;
  opacity?: number;
}) {
  // Gradients are matched by id inside the SVG document, so two gradients that
  // share an id on one screen render as the same fill. A per-instance id keeps
  // them independent.
  const id = useGradientId();
  const [x2, y2] = direction === 'diagonal' ? ['1', '1'] : ['0', '1'];
  const [fromColour, fromAlpha] = splitAlpha(colors[0]);
  const [toColour, toAlpha] = splitAlpha(colors[1]);

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
            <Stop offset="0" stopColor={fromColour} stopOpacity={fromAlpha * opacity} />
            <Stop offset="1" stopColor={toColour} stopOpacity={toAlpha * opacity} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * MEMOISED ON PURPOSE. A gradient sits inside views that re-render as live
 * values arrive; redrawing an SVG document at that rate is visible on a slower
 * phone. The props are stable -- the colour pairs live on the palette object, so
 * they keep the same identity between renders -- so the memo actually holds.
 */
export const Gradient = React.memo(GradientImpl);

/**
 * The inside of a glass button.
 *
 * Two layers, and it takes both to read as glass rather than as a tinted
 * rectangle. The tint is thinnest across the middle and gathers at the top and
 * bottom edges, the way colour does in a thick piece of glass. Over the top
 * half sits a white highlight that fades out by the middle, which is the light
 * the surface is catching.
 *
 * WHY THIS IS NOT TWO <Gradient>s. Each of those is a whole SVG document, and
 * a button would need two. Both layers are drawn in ONE document here, so a
 * glass button costs the same as a solid one.
 *
 * `tint` MUST BE A PLAIN #RRGGBB COLOUR. The strength of each stop goes in
 * `stopOpacity`, because react-native-svg ignores any alpha written into the
 * colour itself -- see splitAlpha above for what that looked like.
 *
 * The numbers differ by theme because the same tint behaves differently on
 * each: on the dark cards it has to be laid on thickly to show at all, and on
 * the light ones a little is plenty and the highlight does most of the work.
 */
function GlassFillImpl({ tint, night }: { tint: string; night: boolean }) {
  const id = useGradientId();
  const [top, middle, bottom] = night ? [0.4, 0.22, 0.34] : [0.16, 0.08, 0.24];
  const highlight = night ? 0.26 : 0.8;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`${id}tint`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity={top} />
            <Stop offset="0.5" stopColor={tint} stopOpacity={middle} />
            <Stop offset="1" stopColor={tint} stopOpacity={bottom} />
          </LinearGradient>
          <LinearGradient id={`${id}light`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={highlight} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}tint)`} />
        <Rect x="0" y="0" width="100%" height="50%" fill={`url(#${id}light)`} />
      </Svg>
    </View>
  );
}

/** Memoised for the same reason Gradient is. */
export const GlassFill = React.memo(GlassFillImpl);

/**
 * The specular sheen that makes a translucent pane read as glass rather than as
 * a semi-transparent rectangle: bright at the top-left, gone by the middle.
 */
export function Sheen({ palette, height = 72 }: { palette: Palette; height?: number }) {
  return (
    <Gradient
      colors={[palette.glassEdge, 'rgba(255,255,255,0)']}
      direction="diagonal"
      style={{ bottom: undefined, height }}
    />
  );
}
