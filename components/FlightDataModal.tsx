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
import type { StoredFlight } from '@/services/FlightStore';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  flight: StoredFlight | null;
  onClose: () => void;
}

// The follower's steps, as the firmware numbers them in
// wallfollowing_corners.h. 0 means the follower never ran -- a hover, or the
// sample before takeoff.
const STEP_NAMES: Record<number, string> = {
  0: '·',
  1: 'follow',
  2: 'stop',
  3: 'turn',
  4: 'verify',
  5: 'past-cnr',
  6: 'reacq',
  7: 'GAVE-UP',
  8: 'back-off',
};

/**
 * Every recorded measurement of a flight, first to last, as a table.
 *
 * The STEP column names what the wall follower was doing, from the drone's own
 * recording. The numbers are the firmware's, in wallfollowing_corners.h -- keep
 * the two in step, or a crash log reads as the wrong thing entirely.
 *
 * The point is to be able to work on the 3D view from data that already exists
 * instead of flying repeatedly to get something to look at. So this shows the
 * raw numbers rather than a summary: whatever the simulator is eventually
 * built to draw, it will be drawing exactly these.
 *
 * Units are metres here, converted from the millimetres the drone reports, to
 * match the rest of the app.
 */
export default function FlightDataModal({ flight, onClose }: Props) {
  const { palette } = useTheme();
  const s = useMemo(() => createStyles(palette), [palette]);

  if (!flight) return null;

  const samples = flight.samples ?? [];

  // TAP A ROW TO SEE EVERYTHING IN IT.
  //
  // Thirteen columns do not fit on a phone, so the six ranger readings -- the
  // ones that say what the aircraft could actually SEE -- were off the right
  // edge behind a horizontal scroll that is awkward to find and awkward to use.
  // Twice in a row a screenshot of a crash arrived showing only the left half
  // of the table, which is the half that cannot explain a crash.
  //
  // The table still scrolls for anyone who wants it. But the important numbers
  // are now one tap away instead of one gesture nobody makes.
  const [openRow, setOpenRow] = useState<number | null>(null);
  const m = (v: number) => (v / 1000).toFixed(2);

  // 0 means "nothing within range" on the multiranger, not "a wall at zero
  // distance". Showing 0.00 would read as an obstacle touching the drone.
  const range = (v: number) => (v === 0 ? '—' : m(v));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{flight.name}</Text>
              <Text style={s.subtitle}>
                {samples.length} samples · one per second · {flight.duration}s
              </Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Text style={s.closeText}>CLOSE</Text>
            </TouchableOpacity>
          </View>

          {samples.length === 0 ? (
            <Text style={s.empty}>
              This flight has no raw samples stored.
            </Text>
          ) : (
            // Horizontal scroll as well as vertical: eight columns do not fit a
            // phone, and squeezing them makes every number unreadable.
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={[s.row, s.headRow]}>
                  {/* STEP and TILT come FIRST, beside the time.
                      They were added at the far right, which on a phone means
                      eight columns of horizontal scrolling to reach the two
                      that explain a crash. Order by what gets read. */}
                  <Text style={[s.cell, s.headCell, s.tCol]}>t</Text>
                  <Text style={[s.cell, s.headCell, s.wideCol]}>STEP</Text>
                  <Text style={[s.cell, s.headCell]}>TILT</Text>
                  <Text style={[s.cell, s.headCell]}>YAW</Text>
                  <Text style={[s.cell, s.headCell]}>X</Text>
                  <Text style={[s.cell, s.headCell]}>Y</Text>
                  <Text style={[s.cell, s.headCell]}>Z</Text>
                  <Text style={[s.cell, s.headCell]}>FRONT</Text>
                  <Text style={[s.cell, s.headCell]}>BACK</Text>
                  <Text style={[s.cell, s.headCell]}>LEFT</Text>
                  <Text style={[s.cell, s.headCell]}>RIGHT</Text>
                  <Text style={[s.cell, s.headCell]}>UP</Text>
                  <Text style={[s.cell, s.headCell]}>DOWN</Text>
                </View>

                <ScrollView style={s.body} nestedScrollEnabled>
                  {samples.map((p, i) => (
                    <View key={i}>
                    <TouchableOpacity
                      style={[s.row, i % 2 === 1 && s.rowAlt,
                              openRow === i && s.rowOpen]}
                      onPress={() => setOpenRow(openRow === i ? null : i)}
                      activeOpacity={0.6}
                    >
                      <Text style={[s.cell, s.tCol, s.tText]}>{i}s</Text>
                      <Text style={[s.cell, s.wideCol]}>{STEP_NAMES[p.wfState ?? 0] ?? '·'}</Text>
                      <Text style={[s.cell, (p.tiltDeg ?? 0) >= 30 ? s.alarm : null]}>
                        {p.tiltDeg === undefined ? '·' : Math.round(p.tiltDeg) + '°'}
                      </Text>
                      <Text style={s.cell}>{p.yaw === undefined ? '·' : Math.round(p.yaw) + '°'}</Text>
                      <Text style={s.cell}>{m(p.x)}</Text>
                      <Text style={s.cell}>{m(p.y)}</Text>
                      <Text style={s.cell}>{m(p.z)}</Text>
                      <Text style={s.cell}>{range(p.front)}</Text>
                      <Text style={s.cell}>{range(p.back)}</Text>
                      <Text style={s.cell}>{range(p.left)}</Text>
                      <Text style={s.cell}>{range(p.right)}</Text>
                      <Text style={s.cell}>{p.up === undefined ? '·' : range(p.up)}</Text>
                      <Text style={s.cell}>{p.down === undefined ? '·' : range(p.down)}</Text>
                    </TouchableOpacity>

                    {openRow === i && (
                      <View style={s.detail}>
                        <Text style={s.detailHead}>
                          {i}s · {STEP_NAMES[p.wfState ?? 0] ?? '·'}
                          {p.tiltDeg !== undefined ? ` · tilt ${Math.round(p.tiltDeg)}°` : ''}
                          {p.yaw !== undefined ? ` · heading ${Math.round(p.yaw)}°` : ''}
                        </Text>
                        <View style={s.detailGrid}>
                          <Det s={s} k="FRONT" v={range(p.front)} />
                          <Det s={s} k="BACK"  v={range(p.back)} />
                          <Det s={s} k="LEFT"  v={range(p.left)} />
                          <Det s={s} k="RIGHT" v={range(p.right)} />
                          <Det s={s} k="UP"    v={p.up === undefined ? '·' : range(p.up)} />
                          <Det s={s} k="DOWN"  v={p.down === undefined ? '·' : range(p.down)} />
                        </View>
                        <Text style={s.detailPos}>
                          position  x {m(p.x)}   y {m(p.y)}   z {m(p.z)}
                        </Text>
                      </View>
                    )}
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          )}

          <Text style={s.footnote}>
            {flight.name?.startsWith('Live (phone)') ? (
              <Text style={{ color: '#e5484d' }}>
                Recorded by the PHONE over Bluetooth while the drone flew away from it:
                gappy, and with no heading, step or tilt. The matching &quot;Drone flight&quot;
                is the complete one.{' '}
              </Text>
            ) : null}
            All values in metres. X/Y/Z are the drone&apos;s estimated position;
            FRONT/BACK/LEFT/RIGHT/UP/DOWN are wall distances; — means nothing was
            in range, and · means the flight predates that sensor being
            recorded.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function Det({ s, k, v }: { s: any; k: string; v: string }) {
  return (
    <View style={s.detItem}>
      <Text style={s.detKey}>{k}</Text>
      <Text style={s.detVal}>{v}</Text>
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: palette.bg,
      borderTopLeftRadius: radius.md,
      borderTopRightRadius: radius.md,
      borderTopWidth: 1,
      borderColor: palette.border,
      padding: spacing.lg,
      maxHeight: '85%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: spacing.md,
    },
    title: {
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.lg,
      fontWeight: 'bold',
    },
    subtitle: {
      fontFamily: type.fontFamily,
      color: palette.textMuted,
      fontSize: type.xs,
      marginTop: 2,
    },
    closeBtn: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      paddingVertical: 6,
      paddingHorizontal: 12,
      marginLeft: spacing.md,
    },
    closeText: {
      fontFamily: type.fontFamily,
      color: palette.textSecondary,
      fontSize: type.xs,
      fontWeight: 'bold',
    },
    body: {
      maxHeight: 420,
    },
    row: {
      flexDirection: 'row',
      paddingVertical: 6,
    },
    rowAlt: {
      backgroundColor: palette.surface,
    },
    headRow: {
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      marginBottom: 2,
    },
    cell: {
      width: 72,
      textAlign: 'right',
      paddingHorizontal: spacing.sm,
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.xs,
    },
    headCell: {
      color: palette.textMuted,
      fontWeight: 'bold',
      fontSize: type.micro,
      letterSpacing: 1,
    },
    rowOpen: {
      backgroundColor: palette.surfaceRaised,
    },
    detail: {
      backgroundColor: palette.surfaceRaised,
      borderLeftWidth: 2,
      borderLeftColor: palette.accent,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.xs,
    },
    detailHead: {
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.xs,
      fontWeight: 'bold',
      marginBottom: spacing.sm,
    },
    detailGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    detItem: {
      width: '33%',
      marginBottom: spacing.sm,
    },
    detKey: {
      fontFamily: type.fontFamily,
      color: palette.textMuted,
      fontSize: 9,
      letterSpacing: 1,
    },
    detVal: {
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.sm,
    },
    detailPos: {
      fontFamily: type.fontFamily,
      color: palette.textSecondary,
      fontSize: type.xs,
    },
    wideCol: {
      width: 74,
    },
    // Past thirty degrees the aircraft is not flying any more, so it is worth
    // finding without reading every row.
    alarm: {
      color: '#e5484d',
      fontWeight: 'bold',
    },
    tCol: {
      width: 48,
      textAlign: 'left',
    },
    tText: {
      color: palette.accent,
      fontWeight: 'bold',
    },
    empty: {
      fontFamily: type.fontFamily,
      color: palette.textSecondary,
      fontSize: type.sm,
      paddingVertical: spacing.lg,
    },
    footnote: {
      fontFamily: type.fontFamily,
      color: palette.textMuted,
      fontSize: type.micro,
      marginTop: spacing.md,
    },
  });
}
