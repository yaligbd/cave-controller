import BatIcon from '@/components/BatIcon';
import { radius, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Href, Link, usePathname } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import our global Drone Context
import { useDroneConnection } from '@/contexts/DroneConnectionContext';

const NAV_ITEMS: { href: Href; label: string }[] = [
  { href: '/', label: 'Connect' },
  { href: '/mission', label: 'Mission' },
  { href: '/simulator', label: 'Simulator' },
  { href: '/settings', label: 'Settings' },
];

// Approximate width of one nav item (padding + label) — exact per-item
// measurement isn't needed, this just needs to get the active item roughly
// into view when it's scrolled off-screen.
const NAV_ITEM_WIDTH_ESTIMATE = 100;

export default function Header() {
  // Extract the variables we need
  const { isConnected, scanForDrone, disconnectFromDrone } = useDroneConnection();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const navScrollRef = useRef<ScrollView>(null);

  const activeIndex = NAV_ITEMS.findIndex((item) => item.href === pathname);

  useEffect(() => {
    if (activeIndex < 0) return;
    const offset = Math.max(0, activeIndex * NAV_ITEM_WIDTH_ESTIMATE - NAV_ITEM_WIDTH_ESTIMATE / 2);
    navScrollRef.current?.scrollTo({ x: offset, animated: true });
  }, [activeIndex]);

  // Create a handler function for the Bluetooth button
  const handleBluetoothPress = () => {
    if (isConnected) {
      disconnectFromDrone();
    } else {
      scanForDrone();
    }
  };

  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        headerContainer: {
          direction: 'ltr',
          backgroundColor: palette.bg,
          borderBottomWidth: 1,
          borderBottomColor: palette.border,
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
          fontFamily: type.fontFamily,
          fontSize: type.sm,
          fontWeight: 'bold',
          letterSpacing: 2,
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
        },
        navItem: {
          minHeight: 44,
          paddingVertical: spacing.md,
          paddingHorizontal: 14,
          justifyContent: 'center',
          alignItems: 'center',
        },
        navText: {
          fontFamily: type.fontFamily,
          fontSize: type.xs,
          letterSpacing: 1,
          textTransform: 'uppercase',
        },
        iconButtons: {
          flexDirection: 'row',
          gap: spacing.sm,
          flexShrink: 0,
        },
        roundButton: {
          width: 32,
          height: 32,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.surface,
          justifyContent: 'center',
          alignItems: 'center',
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
                <TouchableOpacity style={localStyles.navItem}>
                  <Text style={[localStyles.navText, { color: active ? palette.accent : palette.textSecondary }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              </Link>
            );
          })}
        </ScrollView>

        {/* RIGHT SIDE: The Bluetooth Connect/Disconnect Button */}
        <View style={localStyles.iconButtons}>
          <TouchableOpacity style={localStyles.roundButton} onPress={handleBluetoothPress}>
            <Ionicons
              name="bluetooth"
              size={16}
              color={isConnected ? palette.ready : palette.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
