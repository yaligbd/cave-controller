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

import { Tappable } from '@/components/ui/Button';
import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { flightKind, type FlightKind } from '@/services/FlightStore';
import { Flight } from '@/types/flightT';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface FlightCardProps {
  flight: Flight & { samples?: any[]; favourite?: boolean };
  onPress?: () => void;
  /** Draw as selected. The list highlights whichever flight the 3D view shows. */
  selected?: boolean;
  /** Tapping the star. Omitted where starring makes no sense. */
  onToggleFavourite?: () => void;
}

/** Seconds as m:ss, because "185 s" makes you do arithmetic to picture it. */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function FlightCard({ flight, onPress, selected, onToggleFavourite }: FlightCardProps) {
  const { palette } = useTheme();
  const s = useMemo(() => createStyles(palette), [palette]);

  // The card used to be a stock photo of a drone with text laid over it. It
  // looked the same for every flight, so the cards were indistinguishable at a
  // glance and the numbers were hard to read against the image. This shows the
  // flight's own data instead, which is both legible and actually different
  // per flight.
  const samples = flight.flightPath?.time?.length ?? 0;

  // WHO RECORDED THIS, AND DID IT END BADLY.
  //
  // Three kinds of card, three backgrounds, because the three mean very
  // different things and they used to look identical. A phone recording is
  // gappy telemetry heard over BLE while the aircraft flew away; a drone
  // recording is complete; and a crashed flight's numbers stop meaning anything
  // from the moment it went over. Opening the wrong one and seeing nonsense
  // reads as the app being broken.
  const kind: FlightKind = flightKind(flight);
  // A STAR OUTRANKS THE KIND. The kind's colour says where a flight came from,
  // which matters until you have decided a flight is worth keeping -- after
  // that, finding it again is what matters, and gold is the only colour in the
  // app the operator put there themselves. The kind is still on the badge.
  const tone = flight.favourite ? FAVOURITE_TONE : KIND_TONE[kind];

  return (
    <Tappable onPress={onPress}>
      <View
        style={[
          s.card,
          // The kind's colour as a left edge rather than a gradient wash: the
          // same signal, legible down a scrolling list, and free to draw.
          { backgroundColor: tone.bg(palette), borderColor: tone.line(palette), borderLeftWidth: 4 },
          selected && { borderColor: palette.accent, borderWidth: 2, borderLeftWidth: 4 },
        ]}
      >
      <View style={s.header}>
        {!!onToggleFavourite && (
          // Its own Pressable inside the card's: a tap on the star must not
          // also open the flight. hitSlop because the icon alone is a smaller
          // target than a thumb.
          <Pressable
            onPress={onToggleFavourite}
            hitSlop={12}
            style={s.star}
            accessibilityLabel={flight.favourite ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Ionicons
              name={flight.favourite ? 'star' : 'star-outline'}
              size={20}
              color={flight.favourite ? palette.gold : palette.textMuted}
            />
          </Pressable>
        )}
        <Text style={s.title} numberOfLines={1}>{flight.name}</Text>
        <View style={[s.badge, { backgroundColor: alpha(KIND_TONE[kind].line(palette), 0.18) }]}>
          <Text style={[s.badgeText, { color: KIND_TONE[kind].line(palette) }]}>
            {KIND_TONE[kind].label}
          </Text>
        </View>
        {selected && <Text style={s.selectedTag}>SHOWING</Text>}
      </View>

      <View style={s.statsRow}>
        <Stat palette={palette} label="DURATION" value={formatDuration(flight.duration)} />
        <Stat palette={palette} label="MAX ALT" value={`${flight.maxAltitude.toFixed(2)} m`} />
        <Stat palette={palette} label="DISTANCE" value={`${flight.distance.toFixed(2)} m`} />
        <Stat palette={palette} label="SAMPLES" value={String(samples)} />
      </View>

      <Text style={s.hint}>Tap to view the flight data</Text>
      </View>
    </Tappable>
  );
}

const KIND_TONE: Record<FlightKind, {
  label: string;
  bg: (p: Palette) => string;
  line: (p: Palette) => string;
}> = {
  drone:   { label: 'DRONE',   bg: (p) => p.surface,  line: (p) => p.border },
  phone:   { label: 'PHONE',   bg: (p) => p.warnBg,   line: (p) => p.warn },
  crashed: { label: 'CRASHED', bg: (p) => p.faultBg,  line: (p) => p.fault },
};

/** What a starred card is drawn in, whatever kind it is. */
const FAVOURITE_TONE = {
  label: 'FAVOURITE',
  bg: (p: Palette) => p.goldBg,
  line: (p: Palette) => p.gold,
};

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
    badge: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 3,
      marginLeft: spacing.sm,
    },
    badgeText: {
      fontFamily: type.sansMedium,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
    },
    card: {
      backgroundColor: palette.surface,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: palette.border,
      padding: spacing.lg,
      // No shadow and no clipping: these live in a scrolling list, and nothing
      // inside the card reaches its corners now that the gradient wash is gone.
      // The coloured left edge is what distinguishes one card from the next.
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    star: {
      marginRight: spacing.sm,
    },
    title: {
      flex: 1,
      fontFamily: type.sansMedium,
      color: palette.textPrimary,
      fontSize: type.md,
      fontWeight: '700',
    },
    selectedTag: {
      fontFamily: type.sansMedium,
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
      fontFamily: type.sansMedium,
      color: palette.textMuted,
      fontSize: type.micro,
      letterSpacing: 1,
      marginBottom: 3,
    },
    // Monospace, so the four stats line up as a row of figures.
    statValue: {
      fontFamily: type.mono,
      color: palette.textPrimary,
      fontSize: type.sm,
      fontWeight: 'bold',
    },
    hint: {
      fontFamily: type.sans,
      color: palette.textMuted,
      fontSize: type.xs,
      marginTop: spacing.md,
    },
  });
}
