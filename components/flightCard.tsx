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

import { Palette, radius, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Flight } from '@/types/flightT';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface FlightCardProps {
  flight: Flight;
  onPress?: () => void;
  /** Draw as selected. The list highlights whichever flight the 3D view shows. */
  selected?: boolean;
}

/** Seconds as m:ss, because "185 s" makes you do arithmetic to picture it. */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function FlightCard({ flight, onPress, selected }: FlightCardProps) {
  const { palette } = useTheme();
  const s = useMemo(() => createStyles(palette), [palette]);

  // The card used to be a stock photo of a drone with text laid over it. It
  // looked the same for every flight, so the cards were indistinguishable at a
  // glance and the numbers were hard to read against the image. This shows the
  // flight's own data instead, which is both legible and actually different
  // per flight.
  const samples = flight.flightPath?.time?.length ?? 0;

  return (
    <TouchableOpacity
      style={[s.card, selected && { borderColor: palette.accent, borderWidth: 2 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.header}>
        <Text style={s.title} numberOfLines={1}>{flight.name}</Text>
        {selected && <Text style={s.selectedTag}>SHOWING</Text>}
      </View>

      <View style={s.statsRow}>
        <Stat palette={palette} label="DURATION" value={formatDuration(flight.duration)} />
        <Stat palette={palette} label="MAX ALT" value={`${flight.maxAltitude.toFixed(2)} m`} />
        <Stat palette={palette} label="DISTANCE" value={`${flight.distance.toFixed(2)} m`} />
        <Stat palette={palette} label="SAMPLES" value={String(samples)} />
      </View>

      <Text style={s.hint}>Tap to view the flight data</Text>
    </TouchableOpacity>
  );
}

function Stat({ palette, label, value }: { palette: Palette; label: string; value: string }) {
  const s = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    card: {
      backgroundColor: palette.surface,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: palette.border,
      padding: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    title: {
      flex: 1,
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.md,
      fontWeight: 'bold',
    },
    selectedTag: {
      fontFamily: type.fontFamily,
      color: palette.accent,
      fontSize: type.micro,
      fontWeight: 'bold',
      letterSpacing: 1,
      marginLeft: spacing.sm,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    stat: {
      flex: 1,
    },
    statLabel: {
      fontFamily: type.fontFamily,
      color: palette.textMuted,
      fontSize: type.micro,
      letterSpacing: 1,
      marginBottom: 2,
    },
    statValue: {
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.sm,
      fontWeight: 'bold',
    },
    hint: {
      fontFamily: type.fontFamily,
      color: palette.textMuted,
      fontSize: type.micro,
      marginTop: spacing.md,
    },
  });
}
