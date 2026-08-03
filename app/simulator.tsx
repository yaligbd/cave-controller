import Header from '@/components/Header';
import FlightCard from '@/components/flightCard';
import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { demoFlights } from '@/data/demoFlights';
import { Flight } from '@/types/flightT';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function SimulatorScreen() {
  const { styles, palette } = useTheme();
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);

  const localStyles = useMemo(() => createLocalStyles(palette), [palette]);

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <Header />
      <ScrollView style={styles.bodyContainer}>
        <View style={localStyles.banner}>
          <Text style={localStyles.bannerText}>
            Demo data. Real flights require the log download, which is not implemented yet.
          </Text>
        </View>

        {demoFlights.map((flight) => (
          <FlightCard key={flight.id} flight={flight} onPress={() => setSelectedFlight(flight)} />
        ))}

        {selectedFlight && (
          <View style={localStyles.detailCard}>
            <Text style={localStyles.detailTitle}>{selectedFlight.name}</Text>
            <Text style={localStyles.detailRow}>Duration: {selectedFlight.duration} s</Text>
            <Text style={localStyles.detailRow}>Max Altitude: {selectedFlight.maxAltitude} m</Text>
            <Text style={localStyles.detailRow}>Distance: {selectedFlight.distance} m</Text>
            <Text style={localStyles.detailRow}>Battery Usage: {selectedFlight.batteryUsage} %</Text>
            <Text style={localStyles.detailRow}>Samples: {selectedFlight.flightPath.time.length}</Text>

            <View style={localStyles.placeholderBox}>
              <Text style={localStyles.placeholderText}>3D path rendering not implemented yet</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaProvider>
  );
}

function createLocalStyles(palette: Palette) {
  return StyleSheet.create({
    banner: {
      backgroundColor: alpha(palette.warn, 0.1),
      borderColor: palette.warn,
      borderWidth: 1,
      borderRadius: radius.sm,
      padding: spacing.md,
      marginTop: spacing.lg,
      marginBottom: spacing.lg,
    },
    bannerText: {
      fontFamily: type.fontFamily,
      color: palette.warn,
      textAlign: 'center',
      fontSize: type.xs,
      fontWeight: '600',
    },
    detailCard: {
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      padding: spacing.lg,
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
    },
    detailTitle: {
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.lg,
      fontWeight: 'bold',
      marginBottom: spacing.md,
    },
    detailRow: {
      fontFamily: type.fontFamily,
      color: palette.textSecondary,
      fontSize: type.sm,
      marginBottom: spacing.xs + 2,
    },
    placeholderBox: {
      marginTop: spacing.md,
      height: 180,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.bg,
    },
    placeholderText: {
      fontFamily: type.fontFamily,
      color: palette.textMuted,
      fontSize: type.xs,
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
    },
  });
}
