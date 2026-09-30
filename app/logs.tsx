// The fault log.
//
// Every entry answers three questions in the order an operator asks them:
// what happened, what it means, and what to do. The raw technical text is
// folded away behind a tap, because it is what gets pasted into a bug report
// and almost never what gets read in the field.

import Header from '@/components/Header';
import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import { useDialog } from '@/contexts/DialogContext';
import { useTheme } from '@/contexts/ThemeContext';
import { clearLog, LogEntry, subscribeToLog } from '@/services/ErrorLog';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A clock time for today, a date as well for anything older.
 *
 * The log used to be wiped at every restart, so a bare clock time could only
 * ever mean today. It survives the session now, which makes "14:32:05" on its
 * own actively misleading -- a fault from last week reads as one from this
 * morning, and the whole point of keeping it is knowing when it happened.
 */
function timeOf(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? clock : `${d.getDate()} ${MONTHS[d.getMonth()]} ${clock}`;
}

const LEVEL_ICON = {
  error: 'alert-circle' as const,
  warn: 'warning' as const,
  info: 'information-circle' as const,
};

export default function LogsScreen() {
  const { styles, palette } = useTheme();
  const dialog = useDialog();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => subscribeToLog(setEntries), []);

  const colourFor = (level: LogEntry['level']) =>
    level === 'error' ? palette.fault : level === 'warn' ? palette.warn : palette.accent;

  const local = useMemo(() => createStyles(palette), [palette]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onClear = async () => {
    const yes = await dialog.confirm(
      'Clear the log?',
      'Every entry below is discarded. This does not affect saved flights.',
      { destructive: true, confirmLabel: 'Clear' }
    );
    if (yes) {
      clearLog();
      setExpanded(new Set());
    }
  };

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <Header />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={local.titleRow}>
          <Text style={local.screenTitle}>Fault Log</Text>
          {entries.length > 0 && (
            <Pressable onPress={onClear} style={local.clearButton} hitSlop={8}>
              <Text style={local.clearText}>Clear</Text>
            </Pressable>
          )}
        </View>

        {entries.length === 0 ? (
          <View style={local.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={28} color={palette.ready} />
            <Text style={local.emptyTitle}>Nothing has gone wrong</Text>
            <Text style={local.emptyBody}>
              Faults appear here as they happen — lost connections, refused commands, failed
              self-tests — with an explanation and what to do about each one.
            </Text>
          </View>
        ) : (
          entries.map((entry) => {
            const colour = colourFor(entry.level);
            const open = expanded.has(entry.id);
            return (
              <View key={entry.id} style={[local.card, { borderLeftColor: colour }]}>
                <View style={local.cardHead}>
                  <Ionicons name={LEVEL_ICON[entry.level]} size={16} color={colour} />
                  <Text style={[local.cardTitle, { color: palette.textPrimary }]}>{entry.title}</Text>
                  <Text style={local.time}>{timeOf(entry.at)}</Text>
                </View>

                <Text style={local.source}>{entry.source.toUpperCase()}</Text>

                {!!entry.message && <Text style={local.message}>{entry.message}</Text>}
                {!!entry.fix && (
                  <View style={local.fixRow}>
                    <Ionicons name="arrow-forward" size={12} color={palette.textMuted} />
                    <Text style={local.fix}>{entry.fix}</Text>
                  </View>
                )}

                {!!entry.detail && (
                  <>
                    <Pressable onPress={() => toggle(entry.id)} style={local.detailToggle} hitSlop={6}>
                      <Ionicons
                        name={open ? 'chevron-down' : 'chevron-forward'}
                        size={12}
                        color={palette.textMuted}
                      />
                      <Text style={local.detailToggleText}>
                        {open ? 'Hide technical detail' : 'Technical detail'}
                      </Text>
                    </Pressable>
                    {open && (
                      <View style={local.detailBlock}>
                        <Text style={local.detailText} selectable>
                          {entry.detail}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaProvider>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    screenTitle: {
      fontFamily: type.fontFamily,
      fontSize: type.lg,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.textPrimary,
    },
    clearButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
    },
    clearText: {
      fontFamily: type.fontFamily,
      fontSize: type.xs,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.textSecondary,
    },
    emptyCard: {
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      backgroundColor: palette.surface,
    },
    emptyTitle: {
      fontFamily: type.fontFamily,
      fontSize: type.sm,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.textPrimary,
    },
    emptyBody: {
      fontFamily: type.fontFamily,
      fontSize: type.xs,
      lineHeight: type.xs * 1.6,
      color: palette.textSecondary,
      textAlign: 'center',
    },
    card: {
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderLeftWidth: 2,
      borderRadius: radius.sm,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    cardTitle: {
      flex: 1,
      fontFamily: type.fontFamily,
      fontSize: type.sm,
      fontWeight: 'bold',
    },
    time: { fontFamily: type.fontFamily, fontSize: type.micro, color: palette.textMuted },
    source: {
      fontFamily: type.fontFamily,
      fontSize: type.micro,
      letterSpacing: 1.5,
      color: palette.textMuted,
      marginTop: spacing.xs,
    },
    message: {
      fontFamily: type.fontFamily,
      fontSize: type.xs,
      lineHeight: type.xs * 1.6,
      color: palette.textSecondary,
      marginTop: spacing.sm,
    },
    fixRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    fix: {
      flex: 1,
      fontFamily: type.fontFamily,
      fontSize: type.xs,
      lineHeight: type.xs * 1.6,
      color: palette.textMuted,
    },
    detailToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.md,
      minHeight: 28,
    },
    detailToggleText: {
      fontFamily: type.fontFamily,
      fontSize: type.micro,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: palette.textMuted,
    },
    detailBlock: {
      backgroundColor: palette.bg,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      padding: spacing.md,
      marginTop: spacing.xs,
    },
    detailText: {
      fontFamily: type.fontFamily,
      fontSize: type.xs,
      lineHeight: type.xs * 1.5,
      color: alpha(palette.textPrimary, 0.9),
    },
  });
}
