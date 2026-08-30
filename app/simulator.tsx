import Header from '@/components/Header';
import SimulatorWebView from '@/components/SimulatorWebView';
import FlightCard from '@/components/flightCard';
import FlightDataModal from '@/components/FlightDataModal';
import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Flight } from '@/types/flightT';
import {
  deleteFlight,
  listFlights,
  renameFlight,
  type StoredFlight,
} from '@/services/FlightStore';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';

export default function SimulatorScreen() {
  const { styles, palette } = useTheme();
  const { logValues, isConnected, downloadFlightFromDrone, clearDroneRecording} = useDroneConnection();
  // Real flights downloaded from the drone. The demo fixtures are gone: they
  // made an empty app look populated, so "no flights yet" was indistinguishable
  // from "the download is broken".
  const [flights, setFlights] = useState<StoredFlight[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<StoredFlight | null>(null);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  // Which flight's raw measurements to show. Tapping a card opens this, so the
  // data is readable while the 3D view is still being built.
  const [dataFlight, setDataFlight] = useState<StoredFlight | null>(null);
  const [downloading, setDownloading] = useState(false);

  // How many samples the drone says it is holding. 0 means there is nothing to
  // fetch, so the button can say so instead of running a pointless transfer.
  const droneSamples = logValues.get('tele.samples');

  const onDownload = async () => {
    setDownloading(true);
    try {
      const name = `Drone flight ${new Date().toLocaleString()}`;
      const n = await downloadFlightFromDrone(name);
      if (n > 0) {
        reload();
        Alert.alert(
          'Flight downloaded',
          `${n} samples came from the drone's own memory.

Clear the drone's copy now?`,
          [
            { text: 'Keep it', style: 'cancel' },
            { text: 'Clear', onPress: clearDroneRecording },
          ]
        );
      } else {
        Alert.alert(
          'Nothing downloaded',
          'The drone did not send a usable flight. It may not have recorded one yet.'
        );
      }
    } finally {
      setDownloading(false);
    }
  };

  // Reload on every focus, so a flight downloaded on another screen appears
  // here without needing the app restarted.
  const reload = useCallback(() => {
    listFlights().then((list) => {
      setFlights(list);
      setSelectedFlight((cur) => {
        if (cur) {
          const still = list.find((f) => f.id === cur.id);
          if (still) return still;
        }
        return list[0] ?? null;
      });
    });
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const onRename = async (f: StoredFlight) => {
    const name = draftName.trim();
    setRenamingId(null);
    if (!name || name === f.name) return;
    await renameFlight(f.id, name);
    reload();
  };

  const onDelete = (f: StoredFlight) => {
    Alert.alert('Delete flight', `Delete "${f.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => { await deleteFlight(f.id); reload(); },
      },
    ]);
  };

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
          ) : selectedFlight ? (
            <SimulatorWebView flightData={selectedFlight.flightPath} />
          ) : (
            <View style={localStyles.emptyViewer}>
              <Text style={localStyles.emptyTitle}>No flights yet</Text>
              <Text style={localStyles.emptyText}>
                Fly a mission, then download it from the drone. It will appear
                here as a card you can rename or delete.
              </Text>
            </View>
          )}
        </View>

        {/* 2. Dashboard explicitly right under the hologram */}
        <View style={localStyles.detailCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={localStyles.detailTitle}>
              {isLiveMode ? 'Live Flight Mode' : (selectedFlight?.name ?? 'No flight selected')}
            </Text>
            <TouchableOpacity 
              style={[localStyles.liveModeBtn, isLiveMode && localStyles.liveModeBtnActive]}
              onPress={() => setIsLiveMode(!isLiveMode)}
            >
              <Text style={localStyles.liveModeBtnText}>{isLiveMode ? 'STOP LIVE' : 'START LIVE'}</Text>
            </TouchableOpacity>
          </View>
          
          {!isLiveMode ? (
            selectedFlight ? (
              <>
                <Text style={localStyles.detailRow}>Duration: {selectedFlight.duration} s</Text>
                <Text style={localStyles.detailRow}>Max Altitude: {selectedFlight.maxAltitude} m</Text>
                <Text style={localStyles.detailRow}>Distance: {selectedFlight.distance} m</Text>
                <Text style={localStyles.detailRow}>Samples: {selectedFlight.flightPath.time.length}</Text>
              </>
            ) : (
              <Text style={localStyles.detailRow}>Nothing downloaded yet.</Text>
            )
          ) : (
            <>
              <Text style={localStyles.detailRow}>Connected: {isConnected ? 'Yes' : 'No'}</Text>
              <Text style={localStyles.detailRow}>Altitude: {((logValues.get('tele.z') || 0) / 1000.0).toFixed(2)} m</Text>
              <Text style={localStyles.detailRow}>Battery: {((logValues.get('tele.vbat') || 0) / 1000.0).toFixed(2)} V</Text>
            </>
          )}
        </View>

        {/* Pull the flight the DRONE recorded, as opposed to the copy the phone
            made while watching. This is the real store-and-forward path. */}
        {!isLiveMode && isConnected && (
          <TouchableOpacity
            style={[localStyles.downloadBtn, downloading && { opacity: 0.5 }]}
            onPress={onDownload}
            disabled={downloading}
          >
            <Text style={localStyles.downloadText}>
              {downloading
                ? 'DOWNLOADING…'
                : droneSamples
                  ? `DOWNLOAD FLIGHT FROM DRONE (${droneSamples} samples)`
                  : 'DOWNLOAD FLIGHT FROM DRONE'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Saved flights. Real ones only -- see the note on the flights state. */}
        {!isLiveMode && flights.length === 0 && (
          <View style={localStyles.banner}>
            <Text style={localStyles.bannerText}>
              No saved flights. Fly a mission and download it from the drone.
            </Text>
          </View>
        )}

        {!isLiveMode && flights.map((flight) => (
          <View key={flight.id} style={localStyles.flightRow}>
            {renamingId === flight.id ? (
              <View style={localStyles.renameBox}>
                <TextInput
                  style={localStyles.renameInput}
                  value={draftName}
                  onChangeText={setDraftName}
                  autoFocus
                  selectTextOnFocus
                  placeholder="Flight name"
                  placeholderTextColor={palette.textMuted}
                  onSubmitEditing={() => onRename(flight)}
                  returnKeyType="done"
                />
                <TouchableOpacity style={localStyles.smallBtn} onPress={() => onRename(flight)}>
                  <Text style={[localStyles.smallBtnText, { color: palette.ready }]}>SAVE</Text>
                </TouchableOpacity>
                <TouchableOpacity style={localStyles.smallBtn} onPress={() => setRenamingId(null)}>
                  <Text style={localStyles.smallBtnText}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <FlightCard
                  flight={flight}
                  selected={selectedFlight?.id === flight.id}
                  onPress={() => {
                    setSelectedFlight(flight);
                    setDataFlight(flight);
                  }}
                />
                <View style={localStyles.flightActions}>
                  <TouchableOpacity
                    style={localStyles.smallBtn}
                    onPress={() => { setDraftName(flight.name); setRenamingId(flight.id); }}
                  >
                    <Text style={localStyles.smallBtnText}>RENAME</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={localStyles.smallBtn} onPress={() => onDelete(flight)}>
                    <Text style={[localStyles.smallBtnText, { color: palette.fault }]}>DELETE</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        ))}
      </ScrollView>

      <FlightDataModal flight={dataFlight} onClose={() => setDataFlight(null)} />
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
    emptyViewer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    emptyTitle: {
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.lg,
      fontWeight: 'bold',
      marginBottom: spacing.sm,
    },
    emptyText: {
      fontFamily: type.fontFamily,
      color: palette.textSecondary,
      fontSize: type.sm,
      textAlign: 'center',
    },
    downloadBtn: {
      borderWidth: 1,
      borderColor: palette.accent,
      backgroundColor: alpha(palette.accent, 0.12),
      borderRadius: radius.sm,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    downloadText: {
      fontFamily: type.fontFamily,
      color: palette.accent,
      fontSize: type.sm,
      fontWeight: 'bold',
      letterSpacing: 1,
    },
    flightRow: {
      marginBottom: spacing.md,
    },
    flightActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    renameBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      padding: spacing.md,
    },
    renameInput: {
      flex: 1,
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.sm,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingVertical: 4,
    },
    smallBtn: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    smallBtnText: {
      fontFamily: type.fontFamily,
      color: palette.textSecondary,
      fontSize: type.xs,
      fontWeight: 'bold',
    },
    liveModeBtn: {
      // palette.primary does not exist -- see the Palette interface in
      // constants/theme.ts. It resolved to undefined, so this button had no
      // background or border colour at all. accent is the intended one.
      backgroundColor: alpha(palette.accent, 0.2),
      borderColor: palette.accent,
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