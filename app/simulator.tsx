import Header from '@/components/Header';
import SimulatorWebView from '@/components/SimulatorWebView';
import FlightCard from '@/components/flightCard';
import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { demoFlights } from '@/data/demoFlights';
import { Flight } from '@/types/flightT';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';

export default function SimulatorScreen() {
  const { styles, palette } = useTheme();
  const { logValues, isConnected } = useDroneConnection();
  const [selectedFlight, setSelectedFlight] = useState<Flight>(demoFlights[0]);
  const [isLiveMode, setIsLiveMode] = useState(false);

  const localStyles = useMemo(() => createLocalStyles(palette), [palette]);

  const livePoint = isLiveMode && isConnected ? {
    x: (logValues.get('tele.x') || 0) / 1000.0,
    y: (logValues.get('tele.y') || 0) / 1000.0,
    z: (logValues.get('tele.z') || 0) / 1000.0,
    yaw: 0,
    sensors: {
      front: (logValues.get('tele.front') || 0) / 1000.0,
      back: (logValues.get('tele.back') || 0) / 1000.0,
      left: (logValues.get('tele.left') || 0) / 1000.0,
      right: (logValues.get('tele.right') || 0) / 1000.0,
      up: (logValues.get('tele.up') || 0) / 1000.0,
      down: (logValues.get('tele.down') || 0) / 1000.0,
    }
  } : undefined;

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <Header />
      
      <ScrollView style={styles.bodyContainer}>
        {/* 1. 3D Viewer at the top */}
        <View style={localStyles.simulatorContainer}>
          {isLiveMode ? (
            <SimulatorWebView livePoint={livePoint} />
          ) : (
            <SimulatorWebView flightData={selectedFlight.flightPath} />
          )}
        </View>

        {/* 2. Dashboard explicitly right under the hologram */}
        <View style={localStyles.detailCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={localStyles.detailTitle}>{isLiveMode ? 'Live Flight Mode' : selectedFlight.name}</Text>
            <TouchableOpacity 
              style={[localStyles.liveModeBtn, isLiveMode && localStyles.liveModeBtnActive]}
              onPress={() => setIsLiveMode(!isLiveMode)}
            >
              <Text style={localStyles.liveModeBtnText}>{isLiveMode ? 'STOP LIVE' : 'START LIVE'}</Text>
            </TouchableOpacity>
          </View>
          
          {!isLiveMode ? (
            <>
              <Text style={localStyles.detailRow}>Duration: {selectedFlight.duration} s</Text>
              <Text style={localStyles.detailRow}>Max Altitude: {selectedFlight.maxAltitude} m</Text>
              <Text style={localStyles.detailRow}>Distance: {selectedFlight.distance} m</Text>
              <Text style={localStyles.detailRow}>Battery Usage: {selectedFlight.batteryUsage} %</Text>
              <Text style={localStyles.detailRow}>Samples: {selectedFlight.flightPath.time.length}</Text>
            </>
          ) : (
            <>
              <Text style={localStyles.detailRow}>Connected: {isConnected ? 'Yes' : 'No'}</Text>
              <Text style={localStyles.detailRow}>Altitude: {((logValues.get('tele.z') || 0) / 1000.0).toFixed(2)} m</Text>
              <Text style={localStyles.detailRow}>Battery: {((logValues.get('tele.vbat') || 0) / 1000.0).toFixed(2)} V</Text>
            </>
          )}
        </View>

        {/* 3. Demo warning banner */}
        {!isLiveMode && (
          <View style={localStyles.banner}>
            <Text style={localStyles.bannerText}>
              Demo data. Real flights require the log download, which is not implemented yet.
            </Text>
          </View>
        )}

        {/* 4. Selectable Flight List at the bottom */}
        {!isLiveMode && demoFlights.map((flight) => (
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
    liveModeBtn: {
      backgroundColor: alpha(palette.primary, 0.2),
      borderColor: palette.primary,
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    liveModeBtnActive: {
      backgroundColor: alpha(palette.warn, 0.2),
      borderColor: palette.warn,
    },
    liveModeBtnText: {
      color: palette.textPrimary,
      fontSize: type.xs,
      fontWeight: 'bold',
    }
  });
}