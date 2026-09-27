// The app's own dialog, replacing Alert.alert().
//
// WHY THIS EXISTS. Alert.alert() draws the operating system's dialog: rounded,
// system-font, blue-tinted, identical in every app on the phone. Dropping that
// into CaveBat broke the instrument look the rest of the app works to keep, and
// worse, it had nowhere to put the thing that actually matters -- a drone fault
// is usually a line of technical detail ("expander 0x20 not answering") and a
// native alert can only flatten that into the same paragraph as the
// explanation.
//
// So this has three distinct slots instead of two:
//
//   title    what happened, in four words
//   message  what it means for the operator, in plain language
//   detail   the raw technical text, in a monospace block, kept separate
//
// That separation is the whole point. The operator reads the message; the
// detail is what gets photographed and pasted into a log when something needs
// diagnosing.

import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type DialogVariant = 'error' | 'warn' | 'info' | 'success';

export interface DialogAction {
  label: string;
  /** Renders in the fault colour and reads as the dangerous choice. */
  destructive?: boolean;
  /** Renders quietly and is what the back gesture picks. */
  cancel?: boolean;
  onPress?: () => void;
}

export interface DialogSpec {
  variant?: DialogVariant;
  title: string;
  message?: string;
  /** Raw technical text — shown in its own monospace block, never merged into the message. */
  detail?: string;
  actions?: DialogAction[];
}

function variantColours(palette: Palette, variant: DialogVariant) {
  switch (variant) {
    case 'error':
      return { fg: palette.fault, bg: palette.faultBg, icon: 'alert-circle' as const };
    case 'warn':
      return { fg: palette.warn, bg: palette.warnBg, icon: 'warning' as const };
    case 'success':
      return { fg: palette.ready, bg: palette.readyBg, icon: 'checkmark-circle' as const };
    default:
      return { fg: palette.accent, bg: alpha(palette.accent, 0.12), icon: 'information-circle' as const };
  }
}

export default function AppDialog({
  spec,
  onDismiss,
}: {
  spec: DialogSpec | null;
  onDismiss: (action?: DialogAction) => void;
}) {
  const { palette } = useTheme();
  const variant = spec?.variant ?? 'info';
  const colours = useMemo(() => variantColours(palette, variant), [palette, variant]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: alpha('#000000', 0.7),
          justifyContent: 'center',
          padding: spacing.lg,
        },
        card: {
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.borderStrong,
          borderRadius: radius.sm,
          overflow: 'hidden',
          maxHeight: '80%',
        },
        // A coloured bar rather than a coloured card. The severity needs to be
        // readable at a glance without tinting the text behind it.
        accentBar: { height: 2, backgroundColor: colours.fg },
        head: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.lg,
          paddingBottom: spacing.md,
        },
        iconWell: {
          width: 32,
          height: 32,
          borderRadius: radius.sm,
          backgroundColor: colours.bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        title: {
          flex: 1,
          fontFamily: type.fontFamily,
          fontSize: type.md,
          fontWeight: 'bold',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: palette.textPrimary,
          writingDirection: 'ltr',
        },
        body: { paddingHorizontal: spacing.lg },
        message: {
          fontFamily: type.fontFamily,
          fontSize: type.sm,
          lineHeight: type.sm * 1.6,
          color: palette.textSecondary,
          writingDirection: 'ltr',
        },
        detailLabel: {
          fontFamily: type.fontFamily,
          fontSize: type.micro,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: palette.textMuted,
          marginTop: spacing.lg,
          marginBottom: spacing.xs,
        },
        detailBlock: {
          backgroundColor: palette.bg,
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: radius.sm,
          padding: spacing.md,
        },
        detailText: {
          fontFamily: type.fontFamily,
          fontSize: type.xs,
          lineHeight: type.xs * 1.5,
          color: palette.textPrimary,
          writingDirection: 'ltr',
        },
        actions: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: spacing.sm,
          padding: spacing.lg,
        },
        button: {
          minHeight: 44,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.sm,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        buttonText: {
          fontFamily: type.fontFamily,
          fontSize: type.xs,
          letterSpacing: 1,
          textTransform: 'uppercase',
        },
      }),
    [palette, colours]
  );

  const actions: DialogAction[] =
    spec?.actions && spec.actions.length > 0 ? spec.actions : [{ label: 'OK', cancel: true }];

  return (
    <Modal
      visible={!!spec}
      transparent
      animationType="fade"
      // Android's back gesture resolves to the cancel action, so a dialog can
      // never trap the operator with no way out.
      onRequestClose={() => onDismiss(actions.find((a) => a.cancel) ?? actions[actions.length - 1])}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.accentBar} />

          <View style={styles.head}>
            <View style={styles.iconWell}>
              <Ionicons name={colours.icon} size={18} color={colours.fg} />
            </View>
            <Text style={styles.title} allowFontScaling={false}>
              {spec?.title ?? ''}
            </Text>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.sm }}>
            {!!spec?.message && <Text style={styles.message}>{spec.message}</Text>}
            {!!spec?.detail && (
              <>
                <Text style={styles.detailLabel}>Detail</Text>
                <View style={styles.detailBlock}>
                  <Text style={styles.detailText} selectable>
                    {spec.detail}
                  </Text>
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.actions}>
            {actions.map((action) => {
              const fg = action.destructive
                ? palette.fault
                : action.cancel
                  ? palette.textSecondary
                  : palette.accent;
              return (
                <Pressable
                  key={action.label}
                  onPress={() => onDismiss(action)}
                  style={({ pressed }) => [
                    styles.button,
                    {
                      borderColor: action.cancel ? palette.border : fg,
                      backgroundColor: pressed ? alpha(fg, 0.15) : 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.buttonText, { color: fg }]} allowFontScaling={false}>
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
