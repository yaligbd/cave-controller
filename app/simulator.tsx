import Header from '@/components/Header';
import SimulatorWebView from '@/components/SimulatorWebView';
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
  const [selectedFlight, setSelectedFlight] = useState<Flight>(demoFlights[0]);

  const localStyles = useMemo(() => createLocalStyles(palette), [palette]);

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <Header />
      
      <ScrollView style={styles.bodyContainer}>
        {/* 1. 3D Viewer at the top */}
        <View style={localStyles.simulatorContainer}>
          <SimulatorWebView flightData={selectedFlight.flightPath} />
        </View>

        {/* 2. Dashboard explicitly right under the hologram */}
        <View style={localStyles.detailCard}>
          <Text style={localStyles.detailTitle}>{selectedFlight.name}</Text>
          <Text style={localStyles.detailRow}>Duration: {selectedFlight.duration} s</Text>
          <Text style={localStyles.detailRow}>Max Altitude: {selectedFlight.maxAltitude} m</Text>
          <Text style={localStyles.detailRow}>Distance: {selectedFlight.distance} m</Text>
          <Text style={localStyles.detailRow}>Battery Usage: {selectedFlight.batteryUsage} %</Text>
          <Text style={localStyles.detailRow}>Samples: {selectedFlight.flightPath.time.length}</Text>
        </View>

        {/* 3. Demo warning banner */}
        <View style={localStyles.banner}>
          <Text style={localStyles.bannerText}>
            Demo data. Real flights require the log download, which is not implemented yet.
          </Text>
        </View>

        {/* 4. Selectable Flight List at the bottom */}
        {demoFlights.map((flight) => (
          <FlightCard key={flight.id} flight={flight} onPress={() => setSelectedFlight(flight)} />
        ))}
      </ScrollView>
    </SafeAreaProvider>
  );
}

function createLocalStyles(palette: Palette) {
  return StyleSheet.create({
    simulatorContainer: {
      height: 350,
      width: '100%',
      borderWidth: 1, 
      borderColor: palette.border,
      borderRadius: radius.sm, 
      backgroundColor: palette.bg,
      marginBottom: spacing.md, // Pulled slightly tighter to group with the dashboard below
      overflow: 'hidden', 
    },
    detailCard: {
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      padding: spacing.lg,
      marginBottom: spacing.lg, // Changed from xxl to lg to keep standard spacing
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
    banner: {
      backgroundColor: alpha(palette.warn, 0.1),
      borderColor: palette.warn,
      borderWidth: 1,
      borderRadius: radius.sm,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    bannerText: {
      fontFamily: type.fontFamily,
      color: palette.warn,
      textAlign: 'center',
      fontSize: type.xs,
      fontWeight: '600',
    },
  });
}