import { Gradient } from '@/components/ui/Gradient';
import { alpha, radius as radii, shadow, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

/**
 * The app's one button.
 *
 * `tint` carries meaning, not decoration: the connect button is the accent when
 * it will connect and the fault colour when it will disconnect, and a mission
 * abort is always the fault colour. So the colour stays a caller's decision and
 * the variant only says how solidly it is drawn.
 *
 * `solid` lays a white-to-transparent gradient over the tint rather than mixing
 * a second colour, which means any tint gets the same lit-from-above look with
 * no colour arithmetic.
 */
export default function Button({
  label,
  onPress,
  tint,
  variant = 'solid',
  disabled = false,
  icon,
  style,
  round = 'sm',
}: {
  label: string;
  onPress?: () => void;
  /** Defaults to the accent colour. */
  tint?: string;
  variant?: 'solid' | 'outline' | 'ghost';
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  round?: keyof typeof radii;
}) {
  const { palette } = useTheme();
  const colour = disabled ? palette.borderStrong : (tint ?? palette.accent);

  // A button that does not move when touched feels unresponsive on a phone in
  // a way it does not on a desktop, where the cursor is its own feedback.
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.035 }],
    opacity: 1 - press.value * 0.15,
  }));

  // White on a solid fill in both themes: the tints are all mid-to-dark enough
  // to carry white, and a label that changed colour with the theme would make
  // the same button look like two different controls.
  const textColour = disabled ? palette.textMuted : variant === 'solid' ? '#FFFFFF' : colour;

  const fill: ViewStyle =
    variant === 'solid' ? { backgroundColor: colour }
    : variant === 'outline' ? { backgroundColor: alpha(colour, 0.12), borderWidth: 1, borderColor: colour }
    : { backgroundColor: 'transparent' };

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          press.value = withTiming(1, { duration: 90 });
          // Silent if the device has no motor, and never fatal.
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
        }}
        onPressOut={() => {
          press.value = withSpring(0, { damping: 14, stiffness: 240 });
        }}
        style={[
          {
            borderRadius: radii[round],
            overflow: 'hidden',
            paddingVertical: spacing.md + 2,
            paddingHorizontal: spacing.lg,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: spacing.sm,
          },
          fill,
          variant === 'solid' && !disabled ? shadow('sm', palette) : null,
        ]}
      >
        {variant === 'solid' && (
          <Gradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} />
        )}
        {icon}
        <Text
          style={{
            fontFamily: type.sansMedium,
            fontSize: type.sm,
            fontWeight: '700',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: textColour,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Wraps anything that should move when touched — a list row, a card — without
 * imposing a button's padding or fill.
 */
export function Tappable({
  onPress,
  disabled,
  children,
  style,
  scale = 0.98,
}: {
  onPress?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scale?: number;
}) {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * (1 - scale) }],
  }));

  if (disabled) return <View style={style}>{children}</View>;

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { press.value = withTiming(1, { duration: 90 }); }}
        onPressOut={() => { press.value = withSpring(0, { damping: 14, stiffness: 240 }); }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
