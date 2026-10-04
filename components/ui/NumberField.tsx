import { Gradient } from '@/components/ui/Gradient';
import { alpha, radius, shadow, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * A bounded number, entered on a keypad of our own rather than the system one.
 *
 * WHY NOT A TextInput WITH keyboardType="numeric". The Android numeric keyboard
 * covers the bottom half of the screen, which on the mission screen is the Take
 * Off and Abort buttons, and it offers a decimal point and a minus sign for
 * values that are whole and positive. It also lets a field be left empty, or
 * holding something out of range, until a validation dialog says so after the
 * fact.
 *
 * This keypad can only produce a value the field accepts: it will not take more
 * digits than the maximum has, the limits are on screen the whole time, and the
 * sheet closes onto a value already clamped into range. Nothing downstream has
 * to re-check it.
 */
export default function NumberField({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step = 1,
  presets,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Common values, offered as one tap each. */
  presets?: number[];
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text
        style={{
          fontFamily: type.sansMedium,
          fontSize: type.xs,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: palette.textMuted,
          marginBottom: spacing.sm,
        }}
      >
        {label}
      </Text>

      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: palette.surfaceRaised,
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: radius.sm,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <Text style={{ fontFamily: type.mono, fontSize: type.readout, color: palette.textPrimary }}>
            {value}
          </Text>
          <Text style={{ fontFamily: type.sans, fontSize: type.sm, color: palette.textSecondary }}>
            {unit}
          </Text>
        </View>
        <Ionicons name="keypad-outline" size={20} color={palette.textMuted} />
      </Pressable>

      <Keypad
        visible={open}
        title={label}
        unit={unit}
        initial={value}
        min={min}
        max={max}
        step={step}
        presets={presets}
        onClose={() => setOpen(false)}
        onCommit={(n) => {
          onChange(n);
          setOpen(false);
        }}
      />
    </View>
  );
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'clear', '0', 'back'] as const;

function Keypad({
  visible,
  title,
  unit,
  initial,
  min,
  max,
  step,
  presets,
  onClose,
  onCommit,
}: {
  visible: boolean;
  title: string;
  unit: string;
  initial: number;
  min: number;
  max: number;
  step: number;
  presets?: number[];
  onClose: () => void;
  onCommit: (n: number) => void;
}) {
  const { palette } = useTheme();

  // The buffer is a string, not a number, so a half-typed "1" on the way to
  // "100" is not snapped up to the minimum under the typist.
  const [buffer, setBuffer] = useState(String(initial));
  const slide = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setBuffer(String(initial));
      slide.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    } else {
      slide.value = 0;
    }
  }, [visible, initial, slide]);

  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - slide.value) * 420 }],
  }));
  const fade = useAnimatedStyle(() => ({ opacity: slide.value }));

  const parsed = Number(buffer);
  const empty = buffer.length === 0;
  const valid = !empty && Number.isFinite(parsed) && parsed >= min && parsed <= max;
  const clamped = () => Math.min(max, Math.max(min, Number.isFinite(parsed) ? Math.round(parsed) : min));

  const tap = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  };

  const press = (key: string) => {
    tap();
    if (key === 'clear') return setBuffer('');
    if (key === 'back') return setBuffer((b) => b.slice(0, -1));
    // A number with more digits than the maximum can never be valid, so the
    // keypad stops accepting them rather than letting one be typed and then
    // rejected.
    setBuffer((b) => (b.length >= String(max).length ? b : (b === '0' ? '' : b) + key));
  };

  const bump = (delta: number) => {
    tap();
    setBuffer(String(Math.min(max, Math.max(min, clamped() + delta))));
  };

  const keyStyle = {
    flexGrow: 1,
    flexBasis: '30%' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.border,
  };

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
              backgroundColor: palette.glass,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              borderTopWidth: 1,
              borderColor: palette.glassEdge,
              padding: spacing.lg,
              paddingBottom: spacing.xxl,
              overflow: 'hidden',
              ...shadow('lg', palette),
            },
          ]}
        >
          <Gradient colors={palette.gradSurface} />

          {/* The grab handle does nothing, and it is the thing that tells
              everyone this panel is a sheet they can dismiss. */}
          <View
            style={{
              alignSelf: 'center',
              width: 44,
              height: 4,
              borderRadius: radius.pill,
              backgroundColor: palette.borderStrong,
              marginBottom: spacing.lg,
            }}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text
              style={{
                fontFamily: type.sansMedium,
                fontSize: type.md,
                fontWeight: '700',
                color: palette.textPrimary,
              }}
            >
              {title}
            </Text>
            {/* The limits stay on screen rather than appearing in a dialog
                after a bad value has already been typed. */}
            <Text style={{ fontFamily: type.sans, fontSize: type.xs, color: palette.textMuted }}>
              {min} to {max} {unit}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginVertical: spacing.lg,
              gap: spacing.md,
            }}
          >
            <RoundKey icon="remove" onPress={() => bump(-step)} />
            <Text
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: type.mono,
                fontSize: 44,
                color: valid ? palette.textPrimary : palette.fault,
              }}
            >
              {empty ? '-' : buffer}
            </Text>
            <RoundKey icon="add" onPress={() => bump(step)} />
          </View>

          {!!presets?.length && (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
              {presets.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => {
                    tap();
                    setBuffer(String(p));
                  }}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    backgroundColor: alpha(palette.accent, 0.14),
                  }}
                >
                  <Text style={{ fontFamily: type.sansMedium, fontSize: type.sm, color: palette.accent }}>
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {KEYS.map((k) => (
              <Pressable key={k} onPress={() => press(k)} style={keyStyle}>
                {k === 'back' ? (
                  <Ionicons name="backspace-outline" size={22} color={palette.textSecondary} />
                ) : k === 'clear' ? (
                  <Text style={{ fontFamily: type.sansMedium, fontSize: type.sm, color: palette.textSecondary }}>
                    CLR
                  </Text>
                ) : (
                  <Text style={{ fontFamily: type.mono, fontSize: type.xl, color: palette.textPrimary }}>{k}</Text>
                )}
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={() => {
              tap();
              onCommit(clamped());
            }}
            style={{
              marginTop: spacing.lg,
              alignItems: 'center',
              paddingVertical: spacing.md + 2,
              borderRadius: radius.sm,
              overflow: 'hidden',
              backgroundColor: palette.accent,
            }}
          >
            <Gradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} />
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
              {valid ? 'Done' : `Use ${clamped()} ${unit}`}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function RoundKey({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 52,
        height: 52,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: alpha(palette.accent, 0.14),
        borderWidth: 1,
        borderColor: alpha(palette.accent, 0.4),
      }}
    >
      <Ionicons name={icon} size={24} color={palette.accent} />
    </Pressable>
  );
}
