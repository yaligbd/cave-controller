import { Palette, radius, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { StoredFlight } from '@/services/FlightStore';
import React, { useMemo } from 'react';
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

/**
 * Every recorded measurement of a flight, first to last, as a table.
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
                  <Text style={[s.cell, s.headCell, s.tCol]}>t</Text>
                  <Text style={[s.cell, s.headCell]}>X</Text>
                  <Text style={[s.cell, s.headCell]}>Y</Text>
                  <Text style={[s.cell, s.headCell]}>Z</Text>
                  <Text style={[s.cell, s.headCell]}>FRONT</Text>
                  <Text style={[s.cell, s.headCell]}>BACK</Text>
                  <Text style={[s.cell, s.headCell]}>LEFT</Text>
                  <Text style={[s.cell, s.headCell]}>RIGHT</Text>
                </View>

                <ScrollView style={s.body} nestedScrollEnabled>
                  {samples.map((p, i) => (
                    <View key={i} style={[s.row, i % 2 === 1 && s.rowAlt]}>
                      <Text style={[s.cell, s.tCol, s.tText]}>{i}s</Text>
                      <Text style={s.cell}>{m(p.x)}</Text>
                      <Text style={s.cell}>{m(p.y)}</Text>
                      <Text style={s.cell}>{m(p.z)}</Text>
                      <Text style={s.cell}>{range(p.front)}</Text>
                      <Text style={s.cell}>{range(p.back)}</Text>
                      <Text style={s.cell}>{range(p.left)}</Text>
                      <Text style={s.cell}>{range(p.right)}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          )}

          <Text style={s.footnote}>
            All values in metres. X/Y/Z are the drone&apos;s estimated position;
            FRONT/BACK/LEFT/RIGHT are wall distances, and — means nothing was in
            range.
          </Text>
        </View>
      </View>
    </Modal>
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
