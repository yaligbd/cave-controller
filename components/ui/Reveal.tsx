import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

/**
 * Fades and lifts its children in once, on mount.
 *
 * Screens here appear fully drawn the instant they mount, which makes a
 * navigation feel like a cut rather than a move. Giving each panel a small
 * stagger (`index`) reads as the screen assembling itself and costs nothing —
 * it is a transform and an opacity, both on the UI thread, and it never delays
 * the content being present or tappable.
 */
export default function Reveal({
  children,
  /** Position in the stack of panels on this screen; sets the stagger. */
  index = 0,
  style,
  from = 14,
}: {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
  from?: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      index * 70,
      withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) })
    );
  }, [index, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * from }],
  }));

  return <Animated.View style={[animated, style]}>{children}</Animated.View>;
}
