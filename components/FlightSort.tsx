import { alpha, radius, shadow, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { flightKind, type StoredFlight } from '@/services/FlightStore';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * How the flight list is ordered and what it leaves out.
 *
 * BOTH LIVE BEHIND ONE BUTTON. They were two rows of chips above the list,
 * which answered the question before it was asked and cost a third of the
 * screen on the one page whose point is the view above it. A sheet costs one
 * tap and no space at all, and the button itself says the current order, so
 * nothing is hidden -- only folded away.
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

const SORTS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'date', label: 'Date', hint: 'When it was saved' },
  { key: 'duration', label: 'Length', hint: 'How long it flew' },
  { key: 'distance', label: 'Distance', hint: 'How far it travelled' },
  { key: 'altitude', label: 'Altitude', hint: 'How high it got' },
  { key: 'samples', label: 'Readings', hint: 'How many samples it holds' },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'favourite', label: 'Favourites' },
  { key: 'drone', label: 'Drone recordings' },
  { key: 'phone', label: 'Phone recordings' },
  { key: 'crashed', label: 'Crashes' },
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
  const [open, setOpen] = useState(false);

  const sortLabel = SORTS.find((o) => o.key === order.sort)?.label ?? 'Date';
  const filtering = order.filter !== 'all';
  const filterLabel = FILTERS.find((f) => f.key === order.filter)?.label;

  return (
    <View style={{ marginBottom: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm + 2,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: filtering ? alpha(palette.accent, 0.55) : palette.border,
          backgroundColor: filtering ? alpha(palette.accent, 0.16) : alpha(palette.textSecondary, 0.07),
        }}
      >
        <Ionicons name="funnel-outline" size={14} color={filtering ? palette.accent : palette.textSecondary} />
        <Text
          style={{
            fontFamily: type.sansMedium,
            fontSize: type.xs,
            fontWeight: '700',
            color: filtering ? palette.accent : palette.textSecondary,
          }}
        >
          {sortLabel}
          {filtering ? ` · ${filterLabel}` : ''}
        </Text>
        <Ionicons
          name={order.descending ? 'arrow-down' : 'arrow-up'}
          size={13}
          color={filtering ? palette.accent : palette.textMuted}
        />
      </Pressable>

      {/* Only worth saying when the filter is actually hiding something. */}
      {shown !== total && (
        <Text style={{ fontFamily: type.sans, fontSize: type.xs, color: palette.textMuted }}>
          {shown} of {total}
        </Text>
      )}

      <OrderSheet visible={open} order={order} onChange={onChange} onClose={() => setOpen(false)} />
    </View>
  );
}

function OrderSheet({
  visible,
  order,
  onChange,
  onClose,
}: {
  visible: boolean;
  order: FlightOrder;
  onChange: (next: FlightOrder) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const slide = useSharedValue(0);

  useEffect(() => {
    slide.value = visible ? withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }) : 0;
  }, [visible, slide]);

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - slide.value) * 480 }] }));
  const fade = useAnimatedStyle(() => ({ opacity: slide.value }));

  const heading = {
    fontFamily: type.sansMedium,
    fontSize: type.micro,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: palette.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  };

  const row = (active: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: active ? alpha(palette.accent, 0.14) : 'transparent',
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, fade]}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: alpha(palette.bg, 0.72) }]}
          onPress={onClose}
        />
      </Animated.View>

      <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <Animated.View
          style={[
            sheet,
            {
              backgroundColor: palette.surface,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              borderTopWidth: 1,
              borderColor: palette.glassEdge,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
              paddingBottom: spacing.xxl,
              ...shadow('lg', palette),
            },
          ]}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 44,
              height: 4,
              borderRadius: radius.pill,
              backgroundColor: palette.borderStrong,
            }}
          />

          <Text style={heading}>Sort by</Text>
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
                style={row(active)}
              >
                <View>
                  <Text
                    style={{
                      fontFamily: type.sansMedium,
                      fontSize: type.md,
                      color: active ? palette.accent : palette.textPrimary,
                    }}
                  >
                    {o.label}
                  </Text>
                  <Text style={{ fontFamily: type.sans, fontSize: type.xs, color: palette.textMuted }}>
                    {o.hint}
                  </Text>
                </View>
                {active && (
                  <Ionicons
                    name={order.descending ? 'arrow-down' : 'arrow-up'}
                    size={18}
                    color={palette.accent}
                  />
                )}
              </Pressable>
            );
          })}

          <Text style={heading}>Show</Text>
          {FILTERS.map((f) => {
            const active = order.filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => onChange({ ...order, filter: f.key })}
                style={row(active)}
              >
                <Text
                  style={{
                    fontFamily: type.sansMedium,
                    fontSize: type.md,
                    color: active ? palette.accent : palette.textPrimary,
                  }}
                >
                  {f.label}
                </Text>
                {active && <Ionicons name="checkmark" size={18} color={palette.accent} />}
              </Pressable>
            );
          })}

          <Pressable
            onPress={onClose}
            style={{
              marginTop: spacing.xl,
              alignItems: 'center',
              paddingVertical: spacing.md + 2,
              borderRadius: radius.sm,
              backgroundColor: palette.accent,
            }}
          >
            <Text
              style={{
                fontFamily: type.sansMedium,
                fontSize: type.sm,
                fontWeight: '700',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: '#FFFFFF',
              }}
            >
              Done
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
