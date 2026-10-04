import { Palette, useGradientId } from '@/constants/theme';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * A two-stop gradient that fills whatever it is placed inside.
 *
 * WHY SVG AND NOT expo-linear-gradient. That package contains native code, so
 * adding it would mean rebuilding the dev client — and this app's dev client is
 * the one that carries the BLE module. react-native-svg is already in the build
 * and draws the same thing, so the whole visual refresh costs no rebuild and
 * cannot disturb the radio.
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

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
            <Stop offset="0" stopColor={colors[0]} stopOpacity={opacity} />
            <Stop offset="1" stopColor={colors[1]} stopOpacity={opacity} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * MEMOISED ON PURPOSE. The sensors screen holds seven of these and re-renders
 * ten times a second as the ranges arrive; redrawing seven SVG documents at that
 * rate is visible on a slower phone. The props are stable -- the colour pairs
 * live on the palette object, so they keep the same identity between renders --
 * so the memo actually holds and the gradient is drawn once.
 */
export const Gradient = React.memo(GradientImpl);

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
