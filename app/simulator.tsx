// ===========================================================================
//  SAFE TO CHANGE WITHOUT THE DRONE.
// ===========================================================================
//
// This file only reads flight data that has already been recorded and saved.
// Nothing here can stop the drone flying, send it a command, or corrupt what
// it stores. Break it and the worst case is a screen that looks wrong.
//
// This is the right place to work while the drone is unavailable. The 3D view,
// the flight cards, the measurements table and the summary numbers can all be
// developed against flights already on the phone.
//
// Two things it is worth knowing about the data itself:
//
//   Positions (posX/posY/posZ) are the drone's own estimate in metres. They are
//   real. An older version dead-reckoned a fake straight line here, which made
//   every flight look identical; if a path ever looks suspiciously tidy, check
//   that the real positions are actually present rather than being fallen back
//   from.
//
//   yaw is the heading in degrees and it is what places the wall readings. A
//   front reading of 800mm is 800mm in whatever direction the drone was facing,
//   and once it can turn that is not the same direction twice. yaw was
//   hardcoded to zero for a long time, which drew every wall of every flight as
//   though the drone never turned -- the path was right and the room around it
//   was fiction. Flights recorded before that fix have yaw 0 throughout and
//   will always look flat; that is the recording, not the renderer.
//
// The files that CAN stop the drone flying are marked FLIGHT-CRITICAL at the
// top: services/CrtpService.ts, services/TocCache.ts,
// contexts/DroneConnectionContext.tsx and app/mission.tsx.
// ===========================================================================

import Header from '@/components/Header';
import SimulatorWebView from '@/components/SimulatorWebView';
import FlightCard from '@/components/flightCard';
import FlightDataModal from '@/components/FlightDataModal';
import Button from '@/components/ui/Button';
import Reveal from '@/components/ui/Reveal';
import Screen from '@/components/ui/Screen';
import Surface from '@/components/ui/Surface';
import { alpha, Palette, radius, shadow, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import {
  deleteFlight,
  listFlights,
  renameFlight,
  setFavourite,
  type StoredFlight,
} from '@/services/FlightStore';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useDialog } from '@/contexts/DialogContext';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';

export default function SimulatorScreen() {
  const { styles, palette } = useTheme();
  const dialog = useDialog();
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
  // Flights are read from AsyncStorage, which takes long enough to see. Until
  // the first read lands we do not know whether there are any, and "No flights
  // yet" is a claim we cannot make -- it flashed up on every visit to this
  // screen and then vanished as the real ones arrived, which reads as the app
  // losing the flights and finding them again.
  const [loading, setLoading] = useState(true);

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
        const clear = await dialog.confirm(
          'Flight downloaded',
          `${n} samples came from the drone's own memory. Clear the drone's copy now?`,
          { variant: 'success', confirmLabel: 'Clear', cancelLabel: 'Keep it' }
        );
        if (clear) await clearDroneRecording();
      } else {
        await dialog.notify(
          'Nothing downloaded',
          'The drone did not send a usable flight. It may not have recorded one yet.',
          { variant: 'warn' }
        );
      }
    } finally {
      setDownloading(false);
    }
  };

  // Reload on every focus, so a flight downloaded on another screen appears
  // here without needing the app restarted.
  const reload = useCallback(() => {
    listFlights()
      .then((list) => {
        setFlights(list);
        setSelectedFlight((cur) => {
          if (cur) {
            const still = list.find((f) => f.id === cur.id);
            if (still) return still;
          }
          return list[0] ?? null;
        });
      })
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const onRename = async (f: StoredFlight) => {
    const name = draftName.trim();
    setRenamingId(null);
    if (!name || name === f.name) return;
    await renameFlight(f.id, name);
    reload();
  };

  // Starred flights sort to the top of the list, so the card moves under the
  // thumb that tapped it. That is the point -- a star is for finding a flight
  // again -- but it is worth knowing it is deliberate.
  const onToggleFavourite = async (f: StoredFlight) => {
    await setFavourite(f.id, !f.favourite);
    reload();
  };

  const onDelete = async (f: StoredFlight) => {
    const yes = await dialog.confirm(
      'Delete flight',
      `"${f.name}" will be removed from this phone. This cannot be undone.`,
      { destructive: true, confirmLabel: 'Delete' }
    );
    if (!yes) return;
    await deleteFlight(f.id);
    reload();
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
    <Screen>
      <Header />

      <ScrollView style={styles.bodyContainer} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {/* 1. 3D Viewer at the top */}
        <View style={localStyles.simulatorContainer}>
          {isLiveMode ? (
            <SimulatorWebView livePoint={livePoint} />
          ) : loading ? (
            <View style={localStyles.emptyViewer}>
              <ActivityIndicator size="large" color={palette.accent} />
              <Text style={[localStyles.emptyText, { marginTop: spacing.lg }]}>
                Loading saved flights…
              </Text>
            </View>
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
        <Reveal style={localStyles.detailWrap}>
        <Surface level="md">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            {/* flex:1 and one line, or a long flight name pushes the button
                off the row. Android does not hit-test a view drawn outside its
                parent, so the button was both half off-screen AND dead. */}
            <Text style={[localStyles.detailTitle, { flex: 1, marginRight: 8 }]} numberOfLines={1}>
              {isLiveMode
                ? 'Live Flight Mode'
                : loading
                  ? 'Loading…'
                  : (selectedFlight?.name ?? 'No flight selected')}
            </Text>
          </View>

          {!isLiveMode ? (
            selectedFlight ? (
              <View style={localStyles.statGrid}>
                <Stat palette={palette} label="Duration" value={`${selectedFlight.duration} s`} />
                <Stat palette={palette} label="Max alt" value={`${selectedFlight.maxAltitude} m`} />
                <Stat palette={palette} label="Distance" value={`${selectedFlight.distance} m`} />
                <Stat palette={palette} label="Samples" value={String(selectedFlight.flightPath.time.length)} />
              </View>
            ) : loading ? null : (
              <Text style={localStyles.detailRow}>Nothing downloaded yet.</Text>
            )
          ) : (
            <View style={localStyles.statGrid}>
              <Stat palette={palette} label="Connected" value={isConnected ? 'Yes' : 'No'} />
              <Stat
                palette={palette}
                label="Altitude"
                value={`${((logValues.get('tele.z') || 0) / 1000.0).toFixed(2)} m`}
              />
              <Stat
                palette={palette}
                label="Battery"
                value={`${((logValues.get('tele.vbat') || 0) / 1000.0).toFixed(2)} V`}
              />
            </View>
          )}
        </Surface>
        </Reveal>

        {/* A chevron, because the flights below are deliberately off-screen.
            Without it the screen looks like it ends at the card. */}
        {!isLiveMode && flights.length > 0 && (
          <Text style={localStyles.moreHint}>⌄  {flights.length} saved flight{flights.length === 1 ? '' : 's'} below</Text>
        )}

        {/* The two things you can ASK the drone for, together. START LIVE used
            to sit in the middle of the flight summary, where it read as part of
            the flight rather than as a command. */}
        <View style={localStyles.actionRow}>
          <Button
            label={isLiveMode ? 'Stop live' : 'Start live'}
            tint={isLiveMode ? palette.warn : palette.accent}
            variant="outline"
            round="pill"
            onPress={() => setIsLiveMode(!isLiveMode)}
          />
        </View>

        {/* Pull the flight the DRONE recorded, as opposed to the copy the phone
            made while watching. This is the real store-and-forward path. */}
        {!isLiveMode && isConnected && (
          <Button
            label={
              downloading
                ? 'Downloading…'
                : droneSamples
                  ? `Download from drone (${droneSamples} samples)`
                  : 'Download flight from drone'
            }
            variant="solid"
            disabled={downloading}
            onPress={onDownload}
            style={{ marginBottom: spacing.md }}
          />
        )}

        {/* Saved flights. Real ones only -- see the note on the flights state. */}
        {!isLiveMode && !loading && flights.length === 0 && (
          <Surface tone="glass" style={localStyles.banner}>
            <Text style={localStyles.bannerText}>
              No saved flights. Fly a mission and download it from the drone.
            </Text>
          </Surface>
        )}

        {!isLiveMode && flights.map((flight, i) => (
          <Reveal key={flight.id} index={Math.min(i, 6)} style={localStyles.flightRow}>
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
                  onToggleFavourite={() => onToggleFavourite(flight)}
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
          </Reveal>
        ))}
      </ScrollView>

      <FlightDataModal flight={dataFlight} onClose={() => setDataFlight(null)} />
    </Screen>
  );
}

/** One label-over-value cell in the dashboard grid. */
function Stat({ palette, label, value }: { palette: Palette; label: string; value: string }) {
  return (
    <View style={{ minWidth: 76 }}>
      <Text
        style={{
          fontFamily: type.sansMedium,
          fontSize: type.micro,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: palette.textMuted,
          marginBottom: 3,
        }}
      >
        {label}
      </Text>
      {/* Monospace: in live mode these tick over continuously, and a
          proportional font makes the whole row twitch as the digits change. */}
      <Text style={{ fontFamily: type.mono, fontSize: type.md, fontWeight: 'bold', color: palette.textPrimary }}>
        {value}
      </Text>
    </View>
  );
}

function createLocalStyles(palette: Palette) {
  return StyleSheet.create({
    simulatorContainer: {
      // THE HOLOGRAM IS THE SCREEN.
      //
      // It was a fixed 350px, which on a tall phone left it sharing the view
      // with a dashboard and a list -- the one thing anyone opens this screen
      // to look at, given a third of it. Now it takes a little over half the
      // window and everything else starts below the fold, where a chevron says
      // so.
      height: Math.round(Dimensions.get('window').height * 0.55),
      width: '100%',
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: radius.md,
      backgroundColor: palette.bg,
      marginBottom: spacing.md, // Pulled slightly tighter to group with the dashboard below
      overflow: 'hidden',
    },
    moreHint: {
      fontFamily: type.sansMedium,
      color: palette.textMuted,
      fontSize: type.xs,
      textAlign: 'center',
      marginBottom: spacing.sm,
      letterSpacing: 1,
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: spacing.md,
    },
    detailWrap: {
      marginBottom: spacing.lg,
    },
    detailTitle: {
      fontFamily: type.sansMedium,
      color: palette.textPrimary,
      fontSize: type.lg,
      fontWeight: '700',
      marginBottom: spacing.md,
    },
    detailRow: {
      fontFamily: type.sans,
      color: palette.textSecondary,
      fontSize: type.sm,
      marginBottom: spacing.xs + 2,
    },
    // Four numbers across rather than four sentences down: the same facts in a
    // third of the height, which matters on a screen whose point is the view
    // above it.
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: spacing.md,
    },
    banner: {
      backgroundColor: alpha(palette.warn, 0.12),
      borderColor: palette.warn,
      marginBottom: spacing.lg,
    },
    bannerText: {
      fontFamily: type.sans,
      color: palette.warn,
      textAlign: 'center',
      fontSize: type.sm,
      fontWeight: '600',
    },
    emptyViewer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    emptyTitle: {
      fontFamily: type.sansMedium,
      color: palette.textPrimary,
      fontSize: type.xl,
      fontWeight: '700',
      marginBottom: spacing.sm,
    },
    emptyText: {
      fontFamily: type.sans,
      color: palette.textSecondary,
      fontSize: type.sm,
      lineHeight: type.sm * 1.5,
      textAlign: 'center',
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
      padding: spacing.lg,
      ...shadow('sm', palette),
    },
    renameInput: {
      flex: 1,
      fontFamily: type.sans,
      color: palette.textPrimary,
      fontSize: type.md,
      backgroundColor: palette.surfaceRaised,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    smallBtn: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.pill,
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
      backgroundColor: alpha(palette.textSecondary, 0.08),
    },
    smallBtnText: {
      fontFamily: type.sansMedium,
      color: palette.textSecondary,
      fontSize: type.xs,
      fontWeight: '700',
      letterSpacing: 0.8,
    }
  });
}