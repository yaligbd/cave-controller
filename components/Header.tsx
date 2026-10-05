import BatIcon from '@/components/BatIcon';
import StatusStrip from '@/components/StatusStrip';
import { alpha, radius, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Href, Link, usePathname } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import our global Drone Context

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
          height: 52,
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
      }),
    [palette]
  );

  return (
    <View style={[localStyles.headerContainer, { paddingTop: insets.top + spacing.sm }]}>
      {/* Above the logo row, across the full width: the radio and the battery
          as two hairlines. See components/StatusStrip.tsx for why this replaced
          the Bluetooth icon that used to sit on the right of this row. */}
      <StatusStrip />

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
      </View>
    </View>
  );
}
