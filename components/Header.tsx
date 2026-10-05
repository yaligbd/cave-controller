import BatIcon from '@/components/BatIcon';
import { alpha, radius, shadow, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Href, Link, usePathname } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import our global Drone Context
import { useDialog } from '@/contexts/DialogContext';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';

const NAV_ITEMS: { href: Href; label: string }[] = [
  { href: '/', label: 'Connect' },
  { href: '/mission', label: 'Mission' },
  { href: '/simulator', label: 'Simulator' },
  { href: '/logs', label: 'Logs' },
  { href: '/settings', label: 'Settings' },
];

// Approximate width of one nav item (padding + label) — exact per-item
// measurement isn't needed, this just needs to get the active item roughly
// into view when it's scrolled off-screen.
const NAV_ITEM_WIDTH_ESTIMATE = 100;

export default function Header() {
  // Extract the variables we need
  const { isConnected, bleOn, enableBle, disableBle } = useDroneConnection();
  const { palette } = useTheme();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const navScrollRef = useRef<ScrollView>(null);

  const activeIndex = NAV_ITEMS.findIndex((item) => item.href === pathname);

  useEffect(() => {
    if (activeIndex < 0) return;
    const offset = Math.max(0, activeIndex * NAV_ITEM_WIDTH_ESTIMATE - NAV_ITEM_WIDTH_ESTIMATE / 2);
    navScrollRef.current?.scrollTo({ x: offset, animated: true });
  }, [activeIndex]);

  // THIS BUTTON IS BLUETOOTH, NOT THE DRONE.
  //
  // It used to start a scan, which made one icon mean two unrelated things:
  // whether the radio was on, and whether a drone was found. Finding a drone is
  // the Connect button's job, on the screen where that is what you came to do.
  // This is a switch for the radio and nothing else.
  //
  // ON WORKS. OFF USUALLY CANNOT, AND THAT IS ANDROID, NOT US. An app may ask
  // for Bluetooth to be switched on, but since Android 13 it may not switch it
  // off -- the call returns having done nothing. So the off half of this toggle
  // tries, checks whether the radio actually went down, and when it did not,
  // offers the one place that can do it. A toggle that silently fails would be
  // worse than no toggle.
  const handleBluetoothPress = async () => {
    if (!bleOn) {
      await enableBle();
      return;
    }

    const wentOff = await disableBle();
    if (wentOff) return;

    const open = await dialog.confirm(
      'Android will not let the app do that',
      'Bluetooth can be switched on from here, but only you can switch it off. ' +
        'Open Bluetooth settings?',
      { confirmLabel: 'Open settings', cancelLabel: 'Leave it on' }
    );
    if (!open) return;

    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
      } else {
        await Linking.openURL('App-Prefs:Bluetooth');
      }
    } catch {
      await dialog.notify(
        'Could not open settings',
        'Switch Bluetooth off from the phone\'s quick settings instead.',
        { variant: 'warn' }
      );
    }
  };

  // A live radio link is the one piece of state worth announcing without being
  // read: the icon breathes while a drone is attached and sits still otherwise,
  // so "am I still connected" is answerable from the corner of the eye.
  const breath = useSharedValue(0);
  useEffect(() => {
    if (isConnected) {
      breath.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
    } else {
      breath.value = withTiming(0, { duration: 200 });
    }
  }, [isConnected, breath]);

  const pulse = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.08 }],
    opacity: 1 - breath.value * 0.2,
  }));

  const bleTint = isConnected ? palette.ready : bleOn ? palette.accent : palette.textMuted;

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        headerContainer: {
          direction: 'ltr',
          backgroundColor: palette.glass,
          borderBottomWidth: 1,
          borderBottomColor: palette.glassEdge,
        },
        content: {
          direction: 'ltr',
          height: 56,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        },
        logoGroup: {
          direction: 'ltr',
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          flexShrink: 0,
        },
        wordmark: {
          fontFamily: type.sansMedium,
          fontSize: type.md,
          fontWeight: '700',
          letterSpacing: 1.5,
          color: palette.textPrimary,
          writingDirection: 'ltr',
        },
        navScroll: {
          flex: 1,
        },
        navRow: {
          direction: 'ltr',
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
        },
        // The active tab is a filled pill rather than a colour change on the
        // text alone. On a phone held at arm's length a tinted word is easy to
        // miss; a shape is not.
        navItem: {
          minHeight: 36,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: alpha(palette.textSecondary, 0.06),
          justifyContent: 'center',
          alignItems: 'center',
        },
        navItemActive: {
          backgroundColor: alpha(palette.accent, 0.18),
          borderColor: alpha(palette.accent, 0.55),
        },
        navText: {
          fontFamily: type.sansMedium,
          fontSize: type.sm,
          letterSpacing: 0.2,
        },
        iconButtons: {
          flexDirection: 'row',
          gap: spacing.sm,
          flexShrink: 0,
        },
        roundButton: {
          width: 36,
          height: 36,
          borderRadius: radius.pill,
          borderWidth: 1,
          justifyContent: 'center',
          alignItems: 'center',
          ...shadow('sm', palette),
        },
      }),
    [palette]
  );

  return (
    <View style={[localStyles.headerContainer, { paddingTop: insets.top + spacing.md }]}>
      <View style={localStyles.content}>

        {/* LEFT SIDE: Bat icon + wordmark */}
        <View style={localStyles.logoGroup}>
          <BatIcon size={22} />
          <Text style={localStyles.wordmark} allowFontScaling={false}>
            CAVEBAT
          </Text>
        </View>

        {/* MIDDLE: Navigation links — horizontally scrollable so they're never clipped */}
        <ScrollView
          ref={navScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={localStyles.navScroll}
          contentContainerStyle={localStyles.navRow}
        >
          {NAV_ITEMS.map((item, index) => {
            const active = index === activeIndex;
            return (
              <Link key={item.label} href={item.href} asChild>
                {/* THE PILL IS AN INNER VIEW, NOT THE TOUCHABLE. <Link asChild>
                    clones its child with props of its own, which replaced the
                    TouchableOpacity's style -- so the padding never reached the
                    screen and the five labels rendered as one long word,
                    "ConnectMissionSimulatorLogsSettings". A plain View inside
                    is beyond its reach. */}
                <TouchableOpacity activeOpacity={0.7}>
                  <View style={[localStyles.navItem, active && localStyles.navItemActive]}>
                    <Text
                      style={[
                        localStyles.navText,
                        { color: active ? palette.accent : palette.textSecondary },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              </Link>
            );
          })}
        </ScrollView>

        {/* RIGHT SIDE: The Bluetooth Connect/Disconnect Button */}
        <View style={localStyles.iconButtons}>
          <TouchableOpacity
            onPress={() => { void handleBluetoothPress(); }}
            activeOpacity={0.7}
            accessibilityLabel={bleOn ? 'Switch Bluetooth off' : 'Switch Bluetooth on'}
          >
            <Animated.View
              style={[
                localStyles.roundButton,
                {
                  borderColor: bleTint,
                  backgroundColor: alpha(bleTint, bleOn ? 0.16 : 0.06),
                },
                pulse,
              ]}
            >
              <Ionicons
                name={bleOn ? 'bluetooth' : 'bluetooth-outline'}
                size={18}
                color={bleTint}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
