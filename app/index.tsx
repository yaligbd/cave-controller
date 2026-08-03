import Header from '@/components/Header';
import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import { BleStatus, useDroneConnection } from '@/contexts/DroneConnectionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

// LiPo open-circuit voltage -> approximate remaining charge. Piecewise linear
// between these reference points; not a real discharge curve, just enough to
// give a rough sense of "fine / getting low / land now".
const LIPO_CURVE: [voltage: number, percent: number][] = [
  [4.2, 100],
  [4.0, 75],
  [3.85, 50],
  [3.7, 25],
  [3.3, 0],
];

function lipoPercent(voltage: number): number {
  if (voltage >= LIPO_CURVE[0][0]) return 100;
  const last = LIPO_CURVE[LIPO_CURVE.length - 1];
  if (voltage <= last[0]) return 0;
  for (let i = 0; i < LIPO_CURVE.length - 1; i++) {
    const [vHigh, pHigh] = LIPO_CURVE[i];
    const [vLow, pLow] = LIPO_CURVE[i + 1];
    if (voltage <= vHigh && voltage >= vLow) {
      const t = (voltage - vLow) / (vHigh - vLow);
      return pLow + t * (pHigh - pLow);
    }
  }
  return 0;
}

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
    case 'permission-denied':
      return {
        level: 'fault',
        word: 'Permission Denied',
        detail: bleError ?? 'A required permission was refused.',
        spinning: false,
      };
    case 'bluetooth-off':
      return {
        level: 'warn',
        word: 'Bluetooth Off',
        detail: bleError ?? 'Turn on Bluetooth to continue.',
        spinning: false,
      };
    case 'scanning':
      return { level: 'warn', word: 'Scanning', detail: 'Looking for a Crazyflie nearby…', spinning: true };
    case 'found':
      return { level: 'warn', word: 'Drone Found', detail: 'Connecting…', spinning: true };
    case 'connecting':
      return { level: 'warn', word: 'Connecting', detail: 'Establishing BLE link…', spinning: true };
    case 'fetching-toc':
      return { level: 'warn', word: 'Reading Parameters', detail: 'Loading parameter list…', spinning: true };
    case 'error':
      return { level: 'fault', word: 'Error', detail: bleError ?? 'Something went wrong.', spinning: false };
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
    runCrtpProbe,
    logValues,
  } = useDroneConnection();

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

  const connectButtonColor = !bleAvailable ? palette.borderStrong : isConnected ? palette.fault : palette.accent;
  const connectButtonTextColor = !bleAvailable ? palette.textMuted : connectButtonColor;

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
    muted: palette.surface,
    warn: palette.warnBg,
    ready: palette.readyBg,
    fault: palette.faultBg,
  };

  const localStyles = useMemo(() => createLocalStyles(palette), [palette]);

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <Header />
      <View style={localStyles.container}>
        <Text style={styles.label}>Connect</Text>

        <View
          style={[
            localStyles.statusBlock,
            { backgroundColor: CONN_BG[connStatus.level], borderLeftColor: CONN_COLOR[connStatus.level] },
          ]}
        >
          <View style={localStyles.statusWordRow}>
            {connStatus.spinning ? (
              <ActivityIndicator size="small" color={CONN_COLOR[connStatus.level]} style={localStyles.spinner} />
            ) : (
              <Text style={[localStyles.statusWord, { color: CONN_COLOR[connStatus.level] }]}>{'●'} </Text>
            )}
            <Text style={[localStyles.statusWord, { color: CONN_COLOR[connStatus.level] }]}>
              {connStatus.word.toUpperCase()}
            </Text>
          </View>
          <Text style={localStyles.statusDetail}>{connStatus.detail}</Text>
        </View>

        <TouchableOpacity
          style={[
            localStyles.connectButton,
            { borderColor: connectButtonColor, backgroundColor: alpha(connectButtonColor, 0.12) },
          ]}
          onPress={handleConnectPress}
          disabled={!bleAvailable}
        >
          <Text style={[localStyles.connectButtonText, { color: connectButtonTextColor }]}>
            {isConnected ? 'Disconnect' : 'Connect'}
          </Text>
        </TouchableOpacity>

        {isConnected && (
          <TouchableOpacity
            style={[
              localStyles.connectButton,
              { borderColor: palette.warn, backgroundColor: alpha(palette.warn, 0.12) },
            ]}
            onPress={() => runCrtpProbe()}
          >
            <Text style={[localStyles.connectButtonText, { color: palette.warn }]}>RUN CRTP PROBE</Text>
          </TouchableOpacity>
        )}

        <View style={localStyles.panel}>
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
            physically attached.
          </Text>

          {(() => {
            const vbat = logValues.get('pm.vbat');
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
                <Text style={localStyles.caption}>
                  {vbat !== undefined ? 'Live reading from pm.vbat' : 'waiting for data'}
                </Text>
              </>
            );
          })()}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

function createLocalStyles(palette: Palette) {
  return StyleSheet.create({
    container: { flex: 1, alignItems: 'center', padding: spacing.lg },
    panel: {
      width: '100%',
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      padding: spacing.lg,
      marginTop: spacing.lg,
    },
    rowLabel: {
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.sm,
    },
    microLabel: {
      fontFamily: type.fontFamily,
      fontSize: type.micro,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: palette.textMuted,
      marginBottom: spacing.md,
    },
    statusBlock: {
      width: '100%',
      borderLeftWidth: 3,
      borderRadius: radius.sm,
      padding: spacing.lg,
      marginTop: spacing.lg,
    },
    statusWordRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    spinner: {
      marginRight: spacing.sm,
    },
    statusWord: {
      fontFamily: type.fontFamily,
      fontSize: type.md,
      fontWeight: 'bold',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    statusDetail: {
      fontFamily: type.fontFamily,
      fontSize: type.xs,
      color: palette.textSecondary,
      marginTop: spacing.xs,
    },
    connectButton: {
      width: '100%',
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.lg,
    },
    connectButtonText: {
      fontFamily: type.fontFamily,
      fontSize: type.sm,
      fontWeight: 'bold',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    checklistRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    markGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    checkingLabel: {
      fontFamily: type.fontFamily,
      fontSize: type.micro,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: palette.warn,
    },
    mark: {
      fontFamily: type.fontFamily,
      fontSize: type.lg,
      fontWeight: 'bold',
    },
    caption: {
      fontFamily: type.fontFamily,
      fontSize: type.micro,
      color: palette.textMuted,
      marginBottom: spacing.md,
      marginTop: -spacing.xs,
    },
  });
}
