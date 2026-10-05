import { alpha, radius, spacing, type } from '@/constants/theme';
import { useDialog } from '@/contexts/DialogContext';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { lipoPercent, packVolts } from '@/services/Battery';
import React, { useEffect } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

/**
 * One thin row across the top of every screen: the radio on the left, the
 * battery on the right, half each.
 *
 * WHY IT IS NOT AN ICON ANY MORE. The Bluetooth icon sat in the header row and
 * cost about forty points of width that the five navigation tabs needed. It
 * could also only report the radio, while the battery -- the number that
 * decides whether there is time for another flight -- had to be hunted for on
 * the Connect screen.
 *
 * AND WHY THE RADIO IS A WORD, NOT A BAR. It was a bare coloured bar first, and
 * a bar on its own says nothing: there is no way to tell what it is measuring
 * or which end is good. The word says it, and the colour answers it -- blue for
 * off, green for on. The battery can stay a bar because a bar is exactly what a
 * battery is.
 */
export default function StatusStrip() {
  const { palette } = useTheme();
  const dialog = useDialog();
  const { bleOn, isConnected, enableBle, disableBle, logValues } = useDroneConnection();

  const volts = packVolts(logValues);
  const percent = volts !== undefined ? lipoPercent(volts) : null;

  const bleTint = bleOn ? palette.ready : palette.accent;
  const batteryTint =
    percent === null ? palette.textMuted
    : percent > 50 ? palette.ready
    : percent >= 20 ? palette.warn
    : palette.fault;

  // The word breathes only while a drone is actually attached. Something that
  // animated whenever Bluetooth was on would be moving almost all the time,
  // which is the same as not moving at all.
  const breath = useSharedValue(0);
  useEffect(() => {
    breath.value = isConnected
      ? withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true)
      : withTiming(0, { duration: 200 });
  }, [isConnected, breath]);
  const pulse = useAnimatedStyle(() => ({ opacity: 0.6 + breath.value * 0.4 }));

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
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xs,
      }}
    >
      {/* RADIO -- half the width, and the whole half is the tap target. */}
      <Pressable
        onPress={() => { void onPress(); }}
        hitSlop={{ top: 10, bottom: 10 }}
        accessibilityLabel={bleOn ? 'Switch Bluetooth off' : 'Switch Bluetooth on'}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <Animated.View
          style={[
            pulse,
            {
              width: 6,
              height: 6,
              borderRadius: radius.pill,
              backgroundColor: bleTint,
            },
          ]}
        />
        <Animated.Text
          style={[
            pulse,
            {
              fontFamily: type.sansMedium,
              fontSize: type.micro,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: bleTint,
            },
          ]}
          allowFontScaling={false}
        >
          Bluetooth
        </Animated.Text>
      </Pressable>

      {/* BATTERY -- the other half: a track with a proportional fill. */}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            flex: 1,
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
        <Text
          style={{
            fontFamily: type.mono,
            fontSize: type.micro,
            color: percent === null ? palette.textMuted : batteryTint,
            width: 30,
            textAlign: 'right',
          }}
          allowFontScaling={false}
        >
          {percent === null ? '--' : `${Math.round(percent)}%`}
        </Text>
      </View>
    </View>
  );
}
