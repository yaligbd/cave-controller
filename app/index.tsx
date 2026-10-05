import Header from '@/components/Header';
import Button from '@/components/ui/Button';
import Reveal from '@/components/ui/Reveal';
import Screen from '@/components/ui/Screen';
import Surface from '@/components/ui/Surface';
import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import { BleStatus, useDroneConnection } from '@/contexts/DroneConnectionContext';
import { lipoPercent, packVolts } from '@/services/Battery';
import { describeDroneError } from '@/services/DroneErrors';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Hardware checklist rows: name shown in the UI, mapped to the TOC parameter
// whose presence proves that piece is compiled into the connected firmware.
// A tick here means the deck/app is compiled in — NOT that it is physically
// attached. Confirming physical attachment needs a live value read, which
// requires the CRTP log subsystem.
// `route` makes a row tappable (only when its check is green) to drill into a
// dedicated screen — currently only Multi-ranger has one.
const CHECKLIST_ITEMS: { label: string; paramName: string; route?: string }[] = [
  { label: 'Flow deck v2', paramName: 'deck.bcFlow2' },
  { label: 'Multi-ranger', paramName: 'deck.bcMultiranger', route: '/sensors' },
  { label: 'CaveBat firmware', paramName: 'mission.state' },
];

type MarkState = 'disconnected' | 'checking' | 'present' | 'absent';

// TOC done means the fetch has produced entries and isn't still in flight —
// until then we genuinely don't know whether a param is present or absent,
// so neither a tick nor a cross is honest; "checking" covers that whole window
// (both while tocProgress is actively counting up, and the brief instant right
// after connecting before the first TOC request has landed).
function getMarkState(isConnected: boolean, tocDone: boolean, present: boolean): MarkState {
  if (!isConnected) return 'disconnected';
  if (!tocDone) return 'checking';
  return present ? 'present' : 'absent';
}

const MARK_SYMBOL: Record<MarkState, string> = {
  disconnected: '—',
  checking: '?',
  present: '✓',
  absent: '✗',
};

type ConnLevel = 'muted' | 'warn' | 'ready' | 'fault';

interface ConnStatus {
  level: ConnLevel;
  word: string;
  detail: string;
  spinning: boolean;
  /** What to do about it. Only failures carry one. */
  fix?: string;
}

// Every branch here corresponds to a bleStatus value from DroneConnectionContext,
// so the status block always shows what the connect flow is actually doing —
// tapping Connect must never look like it did nothing.
function getConnStatus(
  bleAvailable: boolean,
  bleStatus: BleStatus,
  bleError: string | null,
  isConnected: boolean,
  deviceName: string | null | undefined
): ConnStatus {
  if (!bleAvailable) {
    return { level: 'muted', word: 'Bluetooth Unavailable', detail: 'Not available on this device', spinning: false };
  }

  switch (bleStatus) {
    case 'requesting-permission':
      return { level: 'warn', word: 'Requesting Permission', detail: 'Waiting for Bluetooth permission…', spinning: true };
    case 'permission-denied': {
      const info = describeDroneError(bleError ?? 'permission refused');
      return { level: 'fault', word: info.title, detail: info.message, fix: info.fix, spinning: false };
    }
    case 'bluetooth-off': {
      const info = describeDroneError(bleError ?? 'bluetooth is off');
      return { level: 'warn', word: info.title, detail: info.message, fix: info.fix, spinning: false };
    }
    case 'scanning':
      return { level: 'warn', word: 'Scanning', detail: 'Looking for a Crazyflie nearby…', spinning: true };
    case 'found':
      return { level: 'warn', word: 'Drone Found', detail: 'Connecting…', spinning: true };
    case 'connecting':
      return { level: 'warn', word: 'Connecting', detail: 'Establishing BLE link…', spinning: true };
    case 'fetching-toc':
      return { level: 'warn', word: 'Reading Parameters', detail: 'Loading parameter list…', spinning: true };
    case 'error': {
      // The raw text is never shown as the headline. describeDroneError turns
      // "Operation was rejected" into what happened and what to do, and keeps
      // the original for the detail block.
      const info = describeDroneError(bleError);
      return { level: 'fault', word: info.title, detail: info.message, fix: info.fix, spinning: false };
    }
    case 'connected':
      return { level: 'ready', word: 'Connected', detail: deviceName ?? 'unnamed device', spinning: false };
    case 'idle':
    default:
      return isConnected
        ? { level: 'ready', word: 'Connected', detail: deviceName ?? 'unnamed device', spinning: false }
        : { level: 'muted', word: 'Not Connected', detail: 'Tap CONNECT to scan for a drone', spinning: false };
  }
}

export default function ConnectScreen() {
  const { styles, palette } = useTheme();
  const router = useRouter();
  const {
    isConnected,
    connectedDevice,
    bleAvailable,
    bleStatus,
    bleError,
    params,
    tocProgress,
    scanForDrone,
    disconnectFromDrone,
    findParam,
    logValues, selftestPassed} = useDroneConnection();

  const fetching = tocProgress.total > 0 && tocProgress.loaded < tocProgress.total;
  const tocDone = params.size > 0 && !fetching;

  const connStatus = getConnStatus(bleAvailable, bleStatus, bleError, isConnected, connectedDevice?.name);

  const handleConnectPress = () => {
    if (isConnected) {
      disconnectFromDrone();
    } else {
      scanForDrone();
    }
  };

  // Button handles the disabled colour itself, so this is only about intent:
  // accent when the tap will connect, fault when it will drop the link.
  const connectButtonColor = isConnected ? palette.fault : palette.accent;

  const MARK_COLOR: Record<MarkState, string> = {
    disconnected: palette.textMuted,
    checking: palette.warn,
    present: palette.ready,
    absent: palette.fault,
  };

  const CONN_COLOR: Record<ConnLevel, string> = {
    muted: palette.textMuted,
    warn: palette.warn,
    ready: palette.ready,
    fault: palette.fault,
  };
  const CONN_BG: Record<ConnLevel, string> = {
    muted: palette.surfaceRaised,
    warn: palette.warnBg,
    ready: palette.readyBg,
    fault: palette.faultBg,
  };

  const localStyles = useMemo(() => createLocalStyles(palette), [palette]);

  return (
    <Screen>
      <Header />
      <ScrollView contentContainerStyle={localStyles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Connect</Text>

        <Reveal index={0} style={localStyles.block}>
          <Surface
            tone="glass"
            level="md"
            style={[
              localStyles.statusBlock,
              { backgroundColor: CONN_BG[connStatus.level], borderLeftColor: CONN_COLOR[connStatus.level] },
            ]}
          >
            <View style={localStyles.statusWordRow}>
              {connStatus.spinning ? (
                <ActivityIndicator size="small" color={CONN_COLOR[connStatus.level]} style={localStyles.spinner} />
              ) : (
                <View style={[localStyles.statusDot, { backgroundColor: CONN_COLOR[connStatus.level] }]} />
              )}
              <Text style={[localStyles.statusWord, { color: CONN_COLOR[connStatus.level] }]}>
                {connStatus.word.toUpperCase()}
              </Text>
            </View>
            <Text style={localStyles.statusDetail}>{connStatus.detail}</Text>
            {!!connStatus.fix && <Text style={localStyles.statusFix}>{connStatus.fix}</Text>}
          </Surface>
        </Reveal>

        <Reveal index={1} style={localStyles.block}>
          <Button
            label={isConnected ? 'Disconnect' : 'Connect'}
            tint={connectButtonColor}
            variant={isConnected ? 'outline' : 'solid'}
            disabled={!bleAvailable}
            onPress={handleConnectPress}
          />
        </Reveal>

        <Reveal index={2} style={localStyles.block}>
        <Surface level="md">
          <Text style={localStyles.microLabel}>Hardware Checklist</Text>
          {CHECKLIST_ITEMS.map((item) => {
            const state = getMarkState(isConnected, tocDone, findParam(item.paramName) !== undefined);
            const tappable = !!item.route && state === 'present';
            return (
              <TouchableOpacity
                key={item.paramName}
                style={localStyles.checklistRow}
                disabled={!tappable}
                activeOpacity={tappable ? 0.6 : 1}
                onPress={tappable ? () => router.push(item.route as Href) : undefined}
              >
                <Text style={localStyles.rowLabel}>{item.label}</Text>
                <View style={localStyles.markGroup}>
                  {state === 'checking' && <Text style={localStyles.checkingLabel}>checking</Text>}
                  <Text style={[localStyles.mark, { color: MARK_COLOR[state] }]}>{MARK_SYMBOL[state]}</Text>
                  {tappable && <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />}
                </View>
              </TouchableOpacity>
            );
          })}
          <Text style={localStyles.caption}>
            A checkmark means the parameter is compiled into the firmware, not that the deck has been confirmed
            physically attached. The self-test line below is the drone&apos;s own verdict.
          </Text>

          {/* The drone's boot self-test. When this fails the firmware never
              starts: no flying, no live data, and every command is silently
              ignored. That is indistinguishable from an app bug unless it is
              stated plainly, so it gets its own banner rather than a tick. */}
          {selftestPassed === false && (
            <View style={[localStyles.selftestBanner, { borderColor: palette.fault }]}>
              <Text style={[localStyles.selftestTitle, { color: palette.fault }]}>
                DRONE SELF-TEST FAILED
              </Text>
              <Text style={localStyles.caption}>
                The drone did not finish booting, so its firmware is not running. It will not fly and
                will not send live data, whatever this app sends it. Power-cycle the drone and watch
                its boot output for the failing line.
              </Text>
            </View>
          )}
          {selftestPassed === true && (
            <View style={localStyles.checklistRow}>
              <Text style={localStyles.rowLabel}>Drone self-test</Text>
              <Text style={[localStyles.mark, { color: palette.ready }]}>PASSED</Text>
            </View>
          )}

          {(() => {
            // Both the units question and the fallback to the stock variable
            // live in services/Battery.ts, which the header strip shares.
            const vbat = packVolts(logValues);
            // Published by cavebat.c: 1 = enough battery to attempt takeoff.
            // The firmware refuses takeoff on its own; this only mirrors that
            // decision so a refusal is not mistaken for the app being broken.
            const canFly = logValues.get('tele.canfly');
            // Published by cavebat.c: 0 = something is within mission.minobst
            // (200mm by default) of a side sensor, so takeoff is refused.
            const clear = logValues.get('tele.clear');
            const percent = vbat !== undefined ? lipoPercent(vbat) : null;
            const batteryColor =
              percent === null
                ? palette.textMuted
                : percent > 50
                  ? palette.ready
                  : percent >= 20
                    ? palette.warn
                    : palette.fault;
            return (
              <>
                <View style={localStyles.checklistRow}>
                  <Text style={localStyles.rowLabel}>Battery</Text>
                  <Text style={[localStyles.mark, { color: batteryColor }]}>
                    {vbat !== undefined ? `${vbat.toFixed(2)}V (${Math.round(percent as number)}%)` : '—'}
                  </Text>
                </View>
                {clear !== undefined && (
                  <View style={localStyles.checklistRow}>
                    <Text style={localStyles.rowLabel}>Clear of obstacles</Text>
                    <Text
                      style={[
                        localStyles.mark,
                        { color: clear ? palette.ready : palette.fault },
                      ]}
                    >
                      {clear ? 'YES' : 'NO - TOO CLOSE'}
                    </Text>
                  </View>
                )}
                {canFly !== undefined && (
                  <View style={localStyles.checklistRow}>
                    <Text style={localStyles.rowLabel}>Ready to fly</Text>
                    <Text
                      style={[
                        localStyles.mark,
                        { color: canFly ? palette.ready : palette.fault },
                      ]}
                    >
                      {canFly ? 'YES' : 'NO - BATTERY LOW'}
                    </Text>
                  </View>
                )}
                <Text style={localStyles.caption}>
                  {vbat === undefined
                    ? 'waiting for data'
                    : canFly === 0
                      ? 'Battery too low to take off. The drone will refuse the request. Charge it.'
                      : clear === 0
                        ? 'Something is within 20cm of the drone. It will refuse to take off. Move it to a clearer spot.'
                        : 'Live reading from the drone.'}
                </Text>
              </>
            );
          })()}
        </Surface>
        </Reveal>
      </ScrollView>
    </Screen>
  );
}

function createLocalStyles(palette: Palette) {
  return StyleSheet.create({
    container: { alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.xxl },
    /** Vertical rhythm between panels, now that each one is its own Reveal. */
    block: { width: '100%', marginTop: spacing.lg },
    rowLabel: {
      fontFamily: type.sans,
      color: palette.textPrimary,
      fontSize: type.md,
    },
    microLabel: {
      fontFamily: type.sansMedium,
      fontSize: type.xs,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: palette.textMuted,
      marginBottom: spacing.md,
    },
    // The status colour arrives as a left border and a tinted fill from the
    // caller; Surface supplies the radius, sheen and shadow.
    statusBlock: {
      borderLeftWidth: 4,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: radius.pill,
      marginRight: spacing.sm,
    },
    statusWordRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    spinner: {
      marginRight: spacing.sm,
    },
    statusWord: {
      fontFamily: type.sansMedium,
      fontSize: type.md,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    statusDetail: {
      fontFamily: type.sans,
      fontSize: type.sm,
      color: palette.textSecondary,
      marginTop: spacing.xs,
    },
    // What to do, set apart from what happened. Quieter and indented, so the
    // eye reads the fault first and the instruction second.
    statusFix: {
      fontFamily: type.sans,
      fontSize: type.sm,
      lineHeight: type.sm * 1.5,
      color: palette.textMuted,
      marginTop: spacing.sm,
      paddingLeft: spacing.md,
      borderLeftWidth: 1,
      borderLeftColor: palette.border,
    },
  selftestBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  selftestTitle: {
    fontFamily: type.sansMedium,
    fontSize: type.md,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
    // Each row gets a divider rather than bare spacing, so a long checklist
    // reads as a list instead of floating text.
    checklistRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: alpha(palette.border, 0.6),
    },
    markGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    checkingLabel: {
      fontFamily: type.sansMedium,
      fontSize: type.micro,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: palette.warn,
    },
    mark: {
      fontFamily: type.mono,
      fontSize: type.md,
      fontWeight: 'bold',
    },
    caption: {
      fontFamily: type.sans,
      fontSize: type.xs,
      lineHeight: type.xs * 1.45,
      color: palette.textMuted,
      marginBottom: spacing.md,
      marginTop: spacing.xs,
    },
  });
}
