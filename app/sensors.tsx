import Header from '@/components/Header';
import Reveal from '@/components/ui/Reveal';
import Screen from '@/components/ui/Screen';
import Surface from '@/components/ui/Surface';
import { Palette, radius, spacing, type } from '@/constants/theme';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// This screen does NOT start its own log block. DroneConnectionContext already
// streams all six range variables in block 0 at 100ms from the moment it
// connects, so the values are in logValues before this screen mounts.
//
// It used to create block 1 with the same six variables. Block ids are a
// shared, drone-side namespace: block 1 is the battery/status stream, so
// opening this screen silently replaced it and the battery reading vanished.
// Two screens must never claim the same id.
const NO_DETECTION_MM = 2000;
// There is no down-facing sensor on the multiranger deck — this is the Flow
// deck's z-ranger, reported under the same range.* log group.
const DOWN_RANGE_NAME = 'range.zrange';

/**
 * The proportional bar under a reading.
 *
 * WHY IT IS ANIMATED. These values arrive ten times a second and the deck is
 * noisy, so a bar that snapped to each sample flickered hard enough to be
 * unreadable. Easing over 220ms is slower than the noise and faster than any
 * real approach, so the bar tracks the wall and ignores the jitter.
 */
function RangeBar({ fraction, color }: { fraction: number; color: string }) {
  const { palette } = useTheme();
  const width = useSharedValue(fraction);

  useEffect(() => {
    width.value = withTiming(fraction, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [fraction, width]);

  const animated = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <View
      style={{
        width: '100%',
        height: 5,
        borderRadius: radius.pill,
        backgroundColor: palette.surfaceRaised,
        marginTop: spacing.sm,
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[animated, { height: '100%', borderRadius: radius.pill, backgroundColor: color }]} />
    </View>
  );
}

function readingColor(mm: number, palette: Palette): string {
  if (mm < 200) return palette.fault;
  if (mm <= 500) return palette.warn;
  return palette.ready;
}

export default function SensorsScreen() {
  const { styles, palette } = useTheme();
  const router = useRouter();
  const { isConnected, logValues, hasLogVar } = useDroneConnection();

  // Range streaming is currently switched off in DroneConnectionContext -- see
  // the comment there. Values in logValues would be stale leftovers, and a
  // frozen number that looks live is worse than an honest "not streaming".
  const rangeStreaming = logValues.has('range.front');

  const localStyles = useMemo(() => createLocalStyles(palette), [palette]);

  const renderReading = (label: string, name: string, checkAvailable = false) => {
    if (checkAvailable && !hasLogVar(name)) {
      return (
        <Surface key={name} padded={false} style={localStyles.readoutCell}>
          <Text style={localStyles.readoutLabel}>{label}</Text>
          <Text style={[localStyles.readoutValue, { color: palette.textMuted }]}>—</Text>
          <Text style={localStyles.notAvailableText}>not available</Text>
        </Surface>
      );
    }

    if (!rangeStreaming) {
      return (
        <Surface key={name} padded={false} style={localStyles.readoutCell}>
          <Text style={localStyles.readoutLabel}>{label}</Text>
          <Text style={[localStyles.readoutValue, { color: palette.textMuted }]}>—</Text>
        </Surface>
      );
    }
    const raw = logValues.get(name);
    // 0mm or beyond the sensor's usable range both mean "nothing detected" —
    // never show a number for either.
    const mm = raw !== undefined && raw > 0 && raw <= NO_DETECTION_MM ? raw : null;
    const color = mm !== null ? readingColor(mm, palette) : palette.textMuted;
    const fraction = mm !== null ? mm / NO_DETECTION_MM : 0;

    return (
      <Surface key={name} padded={false} style={localStyles.readoutCell}>
        <Text style={localStyles.readoutLabel}>{label}</Text>
        <Text style={[localStyles.readoutValue, { color }]}>{mm !== null ? mm : '—'}</Text>
        <RangeBar fraction={fraction} color={color} />
      </Surface>
    );
  };

  return (
    <Screen>
      <Header />
      <View style={localStyles.container}>
        <TouchableOpacity style={localStyles.backRow} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={16} color={palette.textSecondary} />
          <Text style={localStyles.backText}>Connect</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Multi-Ranger</Text>

        {!isConnected ? (
          <Text style={localStyles.notConnected}>Not connected — return to Connect to establish a link.</Text>
        ) : (
          <>
            <Reveal index={0} style={localStyles.cross}>
              <View style={localStyles.crossRow}>{renderReading('FRONT', 'range.front')}</View>
              <View style={[localStyles.crossRow, localStyles.crossMiddleRow]}>
                {renderReading('LEFT', 'range.left')}
                <View style={localStyles.centerStack}>
                  {renderReading('UP', 'range.up')}
                  {renderReading('DOWN (FLOW)', DOWN_RANGE_NAME, true)}
                </View>
                {renderReading('RIGHT', 'range.right')}
              </View>
              <View style={localStyles.crossRow}>{renderReading('BACK', 'range.back')}</View>
            </Reveal>

            <Text style={localStyles.caption}>
              Multi-ranger reports distance in millimetres. 0mm or a reading beyond {NO_DETECTION_MM}mm means no
              target detected, shown as “—”. DOWN (FLOW) comes from the Flow deck’s z-ranger, not the multiranger —
              the multiranger deck only covers front, back, left, right and up.
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}

function createLocalStyles(palette: Palette) {
  return StyleSheet.create({
    container: { flex: 1, padding: spacing.lg },
    backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    backText: {
      fontFamily: type.sansMedium,
      fontSize: type.sm,
      color: palette.textSecondary,
      marginLeft: spacing.xs,
    },
    notConnected: {
      fontFamily: type.sans,
      fontSize: type.md,
      color: palette.textMuted,
      textAlign: 'center',
      marginTop: spacing.xxl,
    },
    cross: {
      alignItems: 'center',
      marginTop: spacing.lg,
    },
    crossRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      width: '100%',
    },
    crossMiddleRow: {
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: spacing.md,
    },
    centerStack: {
      alignItems: 'center',
      gap: spacing.md,
    },
    // Surface supplies the fill, border, radius and shadow; what is left here
    // is the cell's own geometry.
    readoutCell: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      width: 112,
    },
    readoutLabel: {
      fontFamily: type.sansMedium,
      fontSize: type.micro,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: palette.textMuted,
      marginBottom: spacing.xs,
    },
    // Monospace, and deliberately: six of these update ten times a second, and
    // in a proportional font the whole cell twitches as the digits change.
    readoutValue: {
      fontFamily: type.mono,
      fontSize: type.readout,
      fontWeight: 'bold',
    },
    notAvailableText: {
      fontFamily: type.sans,
      fontSize: type.micro,
      color: palette.textMuted,
      marginTop: spacing.sm,
    },
    caption: {
      fontFamily: type.sans,
      fontSize: type.xs,
      lineHeight: type.xs * 1.5,
      color: palette.textMuted,
      textAlign: 'center',
      marginTop: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
  });
}
