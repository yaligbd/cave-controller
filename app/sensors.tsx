import Header from '@/components/Header';
import { Palette, radius, spacing, type } from '@/constants/theme';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const BLOCK_ID = 1;
const RANGE_NAMES = ['range.front', 'range.back', 'range.left', 'range.right', 'range.up', 'range.zrange'];
const NO_DETECTION_MM = 2000;
// There is no down-facing sensor on the multiranger deck — this is the Flow
// deck's z-ranger, reported under the same range.* log group.
const DOWN_RANGE_NAME = 'range.zrange';

function readingColor(mm: number, palette: Palette): string {
  if (mm < 200) return palette.fault;
  if (mm <= 500) return palette.warn;
  return palette.ready;
}

export default function SensorsScreen() {
  const { styles, palette } = useTheme();
  const router = useRouter();
  const { isConnected, logValues, startLogBlock, stopLogBlock, hasLogVar } = useDroneConnection();

  useEffect(() => {
    startLogBlock(BLOCK_ID, RANGE_NAMES, 100);
    return () => stopLogBlock(BLOCK_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const localStyles = useMemo(() => createLocalStyles(palette), [palette]);

  const renderReading = (label: string, name: string, checkAvailable = false) => {
    if (checkAvailable && !hasLogVar(name)) {
      return (
        <View style={localStyles.readoutCell} key={name}>
          <Text style={localStyles.readoutLabel}>{label}</Text>
          <Text style={[localStyles.readoutValue, { color: palette.textMuted }]}>—</Text>
          <Text style={localStyles.notAvailableText}>not available</Text>
        </View>
      );
    }

    const raw = logValues.get(name);
    // 0mm or beyond the sensor's usable range both mean "nothing detected" —
    // never show a number for either.
    const mm = raw !== undefined && raw > 0 && raw <= NO_DETECTION_MM ? raw : null;
    const color = mm !== null ? readingColor(mm, palette) : palette.textMuted;
    const fraction = mm !== null ? mm / NO_DETECTION_MM : 0;

    return (
      <View style={localStyles.readoutCell} key={name}>
        <Text style={localStyles.readoutLabel}>{label}</Text>
        <Text style={[localStyles.readoutValue, { color }]}>{mm !== null ? mm : '—'}</Text>
        <View style={localStyles.barTrack}>
          <View style={[localStyles.barFill, { width: `${fraction * 100}%`, backgroundColor: color }]} />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaProvider style={styles.safeArea}>
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
            <View style={localStyles.cross}>
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
            </View>

            <Text style={localStyles.caption}>
              Multi-ranger reports distance in millimetres. 0mm or a reading beyond {NO_DETECTION_MM}mm means no
              target detected, shown as “—”. DOWN (FLOW) comes from the Flow deck’s z-ranger, not the multiranger —
              the multiranger deck only covers front, back, left, right and up.
            </Text>
          </>
        )}
      </View>
    </SafeAreaProvider>
  );
}

function createLocalStyles(palette: Palette) {
  return StyleSheet.create({
    container: { flex: 1, padding: spacing.lg },
    backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    backText: {
      fontFamily: type.fontFamily,
      fontSize: type.sm,
      color: palette.textSecondary,
      marginLeft: spacing.xs,
    },
    notConnected: {
      fontFamily: type.fontFamily,
      fontSize: type.sm,
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
    readoutCell: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      width: 110,
    },
    readoutLabel: {
      fontFamily: type.fontFamily,
      fontSize: type.micro,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: palette.textMuted,
      marginBottom: spacing.xs,
    },
    readoutValue: {
      fontFamily: type.fontFamily,
      fontSize: type.readout,
      fontWeight: 'bold',
    },
    notAvailableText: {
      fontFamily: type.fontFamily,
      fontSize: type.micro,
      color: palette.textMuted,
      marginTop: spacing.sm,
    },
    barTrack: {
      width: '100%',
      height: 4,
      borderRadius: radius.sm,
      backgroundColor: palette.surfaceRaised,
      marginTop: spacing.sm,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
    },
    caption: {
      fontFamily: type.fontFamily,
      fontSize: type.micro,
      color: palette.textMuted,
      textAlign: 'center',
      marginTop: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
  });
}
