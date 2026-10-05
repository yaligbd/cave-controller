import { alpha, radius, spacing, type } from '@/constants/theme';
import { useDialog } from '@/contexts/DialogContext';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { lipoPercent, packVolts } from '@/services/Battery';
import React, { useEffect } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

/**
 * Two hairlines across the top of every screen: the radio, and the battery.
 *
 * WHY IT IS NOT AN ICON ANY MORE. The Bluetooth icon sat in the header row and
 * cost about forty points of width that the navigation needed -- five tabs did
 * not fit, so they scrolled, and the two at the end were invisible. These are
 * four pixels tall across the full width, which is less space than the icon
 * took and says more: the icon could only report the radio, and the battery had
 * to be hunted for on the Connect screen.
 *
 * Both answer at a glance and neither needs reading. The battery is the one
 * that decides whether there is time for another flight, and it was the number
 * being checked most often.
 */
export default function StatusStrip() {
  const { palette } = useTheme();
  const dialog = useDialog();
  const { bleOn, isConnected, enableBle, disableBle, logValues } = useDroneConnection();

  const volts = packVolts(logValues);
  const percent = volts !== undefined ? lipoPercent(volts) : null;

  const bleTint = isConnected ? palette.ready : bleOn ? palette.accent : palette.textMuted;
  const batteryTint =
    percent === null ? palette.textMuted
    : percent > 50 ? palette.ready
    : percent >= 20 ? palette.warn
    : palette.fault;

  // The radio bar breathes only while a drone is actually attached. A bar that
  // animated whenever Bluetooth was on would be moving almost all the time,
  // which is the same as not moving at all.
  const breath = useSharedValue(0);
  useEffect(() => {
    breath.value = isConnected
      ? withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true)
      : withTiming(0, { duration: 200 });
  }, [isConnected, breath]);
  const pulse = useAnimatedStyle(() => ({ opacity: 0.55 + breath.value * 0.45 }));

  // Nothing read yet means an empty track, not a full one. A strip that showed
  // a full battery before the drone had said anything would be a lie at the
  // exact moment it matters.
  const fill = percent === null ? 0 : Math.max(2, percent);

  const onPress = async () => {
    if (!bleOn) {
      await enableBle();
      return;
    }
    const wentOff = await disableBle();
    if (wentOff) return;

    // Android 13 and later will not let an app switch the radio off -- see
    // disableBle() in DroneConnectionContext. Offer the one place that can.
    const open = await dialog.confirm(
      'Android will not let the app do that',
      'Bluetooth can be switched on from here, but only you can switch it off. Open Bluetooth settings?',
      { confirmLabel: 'Open settings', cancelLabel: 'Leave it on' }
    );
    if (!open) return;
    try {
      if (Platform.OS === 'android') await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
      else await Linking.openURL('App-Prefs:Bluetooth');
    } catch {
      await dialog.notify(
        'Could not open settings',
        'Switch Bluetooth off from the phone’s quick settings instead.',
        { variant: 'warn' }
      );
    }
  };

  return (
    <Pressable
      onPress={() => { void onPress(); }}
      // The strip is four pixels tall. Without this it is decoration rather
      // than a control.
      hitSlop={{ top: 14, bottom: 14, left: 0, right: 0 }}
      accessibilityLabel={bleOn ? 'Switch Bluetooth off' : 'Switch Bluetooth on'}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
      }}
    >
      {/* RADIO. One third of the width, because it has one bit to say. */}
      <Animated.View
        style={[
          pulse,
          {
            flex: 1,
            height: 4,
            borderRadius: radius.pill,
            backgroundColor: bleOn ? bleTint : alpha(palette.textMuted, 0.35),
          },
        ]}
      />

      {/* BATTERY. Two thirds, as a track with a proportional fill. */}
      <View
        style={{
          flex: 2,
          height: 4,
          borderRadius: radius.pill,
          backgroundColor: alpha(palette.textMuted, 0.25),
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${fill}%`,
            height: '100%',
            borderRadius: radius.pill,
            backgroundColor: batteryTint,
          }}
        />
      </View>

      {/* The only text, and only once there is something true to say. */}
      <Text
        style={{
          fontFamily: type.mono,
          fontSize: 9,
          color: palette.textMuted,
          width: 30,
          textAlign: 'right',
        }}
      >
        {percent === null ? '--' : `${Math.round(percent)}%`}
      </Text>
    </Pressable>
  );
}
