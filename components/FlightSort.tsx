import { alpha, radius, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { flightKind, type StoredFlight } from '@/services/FlightStore';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

/**
 * How the flight list is ordered and what it leaves out.
 *
 * SORT AND FILTER ARE SEPARATE, DELIBERATELY. "Show me the crashes" and "order
 * by how far it flew" are different questions, and folding them into one list
 * of options means you can only ask one at a time. Kept apart, "the furthest
 * crash" is two taps.
 */
export type SortKey = 'date' | 'duration' | 'distance' | 'altitude' | 'samples';
export type FilterKey = 'all' | 'favourite' | 'drone' | 'phone' | 'crashed';

export interface FlightOrder {
  sort: SortKey;
  /** true = biggest first, which is the useful default for every measure. */
  descending: boolean;
  filter: FilterKey;
}

export const DEFAULT_ORDER: FlightOrder = { sort: 'date', descending: true, filter: 'all' };

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'duration', label: 'Length' },
  { key: 'distance', label: 'Distance' },
  { key: 'altitude', label: 'Altitude' },
  { key: 'samples', label: 'Readings' },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'favourite', label: '★ Favourites' },
  { key: 'drone', label: 'Drone' },
  { key: 'phone', label: 'Phone' },
  { key: 'crashed', label: 'Crashed' },
];

function valueOf(f: StoredFlight, key: SortKey): number {
  switch (key) {
    case 'duration': return f.duration ?? 0;
    case 'distance': return f.distance ?? 0;
    case 'altitude': return f.maxAltitude ?? 0;
    case 'samples': return f.flightPath?.time?.length ?? 0;
    case 'date':
    default: return f.savedAt ?? 0;
  }
}

/**
 * Applies an order to a list. Pure, and it copies before sorting -- the array
 * it is handed is the screen's state, and sorting in place would mutate state
 * React believes it owns.
 */
export function applyOrder(flights: StoredFlight[], order: FlightOrder): StoredFlight[] {
  const kept = flights.filter((f) => {
    switch (order.filter) {
      case 'favourite': return !!f.favourite;
      case 'drone': return flightKind(f) === 'drone';
      case 'phone': return flightKind(f) === 'phone';
      case 'crashed': return flightKind(f) === 'crashed';
      case 'all':
      default: return true;
    }
  });

  return [...kept].sort((a, b) => {
    const d = valueOf(a, order.sort) - valueOf(b, order.sort);
    return order.descending ? -d : d;
  });
}

export default function FlightSort({
  order,
  onChange,
  total,
  shown,
}: {
  order: FlightOrder;
  onChange: (next: FlightOrder) => void;
  total: number;
  shown: number;
}) {
  const { palette } = useTheme();

  const chip = (active: boolean) => ({
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: active ? alpha(palette.accent, 0.55) : palette.border,
    backgroundColor: active ? alpha(palette.accent, 0.18) : alpha(palette.textSecondary, 0.06),
  });

  const chipText = (active: boolean) => ({
    fontFamily: type.sansMedium,
    fontSize: type.xs,
    fontWeight: '700' as const,
    color: active ? palette.accent : palette.textSecondary,
  });

  const rowLabel = {
    fontFamily: type.sansMedium,
    fontSize: type.micro,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: palette.textMuted,
    marginBottom: spacing.sm,
  };

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={rowLabel}>Show</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {FILTERS.map((f) => {
          const active = order.filter === f.key;
          return (
            <Pressable key={f.key} onPress={() => onChange({ ...order, filter: f.key })} style={chip(active)}>
              <Text style={chipText(active)}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={[rowLabel, { marginTop: spacing.md }]}>Sort by</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {SORTS.map((o) => {
          const active = order.sort === o.key;
          return (
            <Pressable
              key={o.key}
              // Tapping the sort already in use flips its direction, which is
              // where everyone reaches for it anyway.
              onPress={() =>
                onChange(
                  active
                    ? { ...order, descending: !order.descending }
                    : { ...order, sort: o.key, descending: true }
                )
              }
              style={[chip(active), { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
            >
              <Text style={chipText(active)}>{o.label}</Text>
              {active && (
                <Ionicons
                  name={order.descending ? 'arrow-down' : 'arrow-up'}
                  size={12}
                  color={palette.accent}
                />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Only worth saying when the filter is actually hiding something. A
          count that always reads "6 of 6" is noise. */}
      {shown !== total && (
        <Text
          style={{
            fontFamily: type.sans,
            fontSize: type.xs,
            color: palette.textMuted,
            marginTop: spacing.md,
          }}
        >
          {shown} of {total} flights
        </Text>
      )}
    </View>
  );
}
