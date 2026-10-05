import { Sheen } from '@/components/ui/Gradient';
import { radius as radii, shadow, ShadowLevel, spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

export type SurfaceTone =
  /** An opaque card, lit from above. The default for panels full of readouts. */
  | 'panel'
  /** Translucent with a specular sheen — for things that float over content. */
  | 'glass'
  /** No fill of its own. For grouping without adding another visible layer. */
  | 'flat';

/**
 * Every raised rectangle in the app.
 *
 * It exists so the gradient fill, the glass sheen, the top highlight and the
 * shadow are defined once. Screens previously each carried their own `panel`
 * style, which is why a change to how a card looks used to mean eleven edits.
 */
export default function Surface({
  tone = 'panel',
  level = 'sm',
  round = 'sm',
  padded = true,
  style,
  children,
}: {
  tone?: SurfaceTone;
  level?: ShadowLevel;
  round?: keyof typeof radii;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const { palette } = useTheme();
  const borderRadius = radii[round];

  // The glass pane's own translucency has to sit on the container, because the
  // gradient children cannot be seen through their own parent's fill.
  const base: ViewStyle = {
    borderRadius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tone === 'glass' ? palette.glassEdge : palette.border,
    backgroundColor:
      tone === 'glass' ? palette.glass : tone === 'flat' ? 'transparent' : palette.surface,
    ...(tone === 'flat' ? {} : shadow(level, palette)),
  };

  return (
    <View style={[base, padded && { padding: spacing.lg }, style]}>
      {/* A PANEL HAS NO GRADIENT, ON PURPOSE. It used to draw one, which meant
          an SVG document per card -- seven of them on the sensors screen, all
          re-rendering as the ranges arrive, and one more behind the 3D view.
          The app got visibly slower. The raised look comes from the fill, the
          shadow and the highlight below, which cost nothing; the gradient was
          adding almost no contrast on a card this small.

          `glass` keeps its sheen because there are only ever one or two on a
          screen and the effect is the whole point of that tone. */}
      {tone === 'glass' && <Sheen palette={palette} />}
      {/* The hairline along the top edge. On a dark theme this reads as the
          edge catching light and is most of what makes a card look raised —
          a cast shadow is nearly invisible against a near-black background. */}
      {tone !== 'flat' && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: borderRadius,
            right: borderRadius,
            height: 1,
            backgroundColor: palette.glassEdge,
          }}
        />
      )}
      {children}
    </View>
  );
}
