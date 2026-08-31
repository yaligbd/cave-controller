import Header from '@/components/Header';
import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useDroneConnection } from '@/contexts/DroneConnectionContext';
import { useTheme } from '@/contexts/ThemeContext';

const TIMER_MIN = 1;
const TIMER_MAX = 45;
const HEIGHT_MIN = 200;
const HEIGHT_MAX = 1500;
const SAMPLEDIST_MIN = 5;
const SAMPLEDIST_MAX = 100;

type StatusLevel = 'muted' | 'warn' | 'ready';

interface Status {
  level: StatusLevel;
  message: string;
  subMessage?: string;
}

function getStatus(
  bleAvailable: boolean,
  isConnected: boolean,
  tocProgress: { loaded: number; total: number },
  params: Map<string, unknown>
): Status {
  if (!bleAvailable) {
    return { level: 'muted', message: 'Bluetooth unavailable on this device' };
  }
  if (!isConnected) {
    return { level: 'muted', message: 'Not connected — tap the Bluetooth icon' };
  }

  const readingToc = tocProgress.total > 0 && tocProgress.loaded < tocProgress.total;
  if (readingToc) {
    return { level: 'warn', message: `Reading drone parameters… ${tocProgress.loaded}/${tocProgress.total}` };
  }

  if (!params.has('mission.state')) {
    return {
      level: 'warn',
      message: 'Connected. CaveBat firmware not found on this drone.',
      subMessage: `${params.size} parameters found`,
    };
  }

  return { level: 'ready', message: 'Ready to fly' };
}

export default function MissionScreen() {
  const { styles, palette } = useTheme();
  const { isConnected, bleAvailable, params, tocProgress, setParam, startFlightRecording, stopFlightRecording} = useDroneConnection();

  const [timer, setTimer] = useState(10);
  const [height, setHeight] = useState(500);
  const [sampleDist, setSampleDist] = useState(10);
  // Off by default, matching the firmware. Wall following is the interesting
  // mode but also the untested one, so it is something you choose rather than
  // something you have to remember to turn off.
  const [wallFollow, setWallFollow] = useState(false);
  const [flying, setFlying] = useState(false);

  const status = getStatus(bleAvailable, isConnected, tocProgress, params);

  const STATUS_COLOR: Record<StatusLevel, string> = {
    muted: palette.textMuted,
    warn: palette.warn,
    ready: palette.ready,
  };
  const STATUS_BG: Record<StatusLevel, string> = {
    muted: palette.surface,
    warn: palette.warnBg,
    ready: palette.readyBg,
  };

  const validateInputs = (): string | null => {
    if (!Number.isFinite(timer) || timer < TIMER_MIN || timer > TIMER_MAX) {
      return `Hover time must be between ${TIMER_MIN} and ${TIMER_MAX} seconds.`;
    }
    if (!Number.isFinite(height) || height < HEIGHT_MIN || height > HEIGHT_MAX) {
      return `Altitude must be between ${HEIGHT_MIN} and ${HEIGHT_MAX} mm.`;
    }
    if (!Number.isFinite(sampleDist) || sampleDist < SAMPLEDIST_MIN || sampleDist > SAMPLEDIST_MAX) {
      return `Measure distance must be between ${SAMPLEDIST_MIN} and ${SAMPLEDIST_MAX} cm.`;
    }
    return null;
  };

  const handleTakeOff = async () => {
    const validationError = validateInputs();
    if (validationError) {
      Alert.alert('Invalid input', validationError);
      return;
    }

    try {
      await setParam('mission.timer', timer);

      if (params.has('mission.height')) {
        await setParam('mission.height', height);
      } else {
        console.log('[mission] firmware has no mission.height parameter — skipping altitude');
      }

      if (params.has('mission.sampledist')) {
        await setParam('mission.sampledist', sampleDist);
      } else {
        console.log('[mission] firmware has no mission.sampledist parameter — skipping sample distance');
      }

      // Always written, never assumed. The firmware defaults this to 0, but a
      // previous mission on the same power cycle may have left it at 1, and a
      // drone that goes wall following when you asked it to hover is worse
      // than one that refuses to.
      if (params.has('mission.wallfollow')) {
        await setParam('mission.wallfollow', wallFollow ? 1 : 0);
      } else if (wallFollow) {
        // Say so rather than flying a hover and leaving the pilot to wonder
        // why the drone ignored them. This is exactly what happened once:
        // the firmware had the parameter, the app had no way to set it, and
        // the flight looked identical to a normal hover with no explanation.
        Alert.alert(
          'This firmware cannot wall follow',
          'The drone does not have the mission.wallfollow parameter, so it ' +
          'would simply hover. Flash the mission firmware first.'
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Start recording BEFORE the mission command, so the climb is captured
      // from the first moment rather than from wherever the drone happens to
      // be once it is already moving.
      startFlightRecording();

      await setParam('mission.state', 1);
      setFlying(true);

      // Stop after the mission plus a margin for the climb and the landing.
      // Time-based rather than watching for the drone to report itself done:
      // the flight runs on the drone and the app is only a bystander here, and
      // an over-long recording just adds a few still samples at the end --
      // whereas stopping early would cut the landing off the flight path.
      const totalMs = (timer + 10) * 1000;
      setTimeout(async () => {
        const name = `Flight ${new Date().toLocaleString()}`;
        const n = await stopFlightRecording(name);
        setFlying(false);
        if (n > 0) {
          Alert.alert(
            'Flight saved',
            `${n} samples recorded.

Open the SIMULATOR screen to view it in 3D, rename it, or delete it.`
          );
        } else {
          Alert.alert(
            'Nothing recorded',
            'No usable samples were captured. Check that the drone is connected and streaming.'
          );
        }
      }, totalMs);
    } catch (error) {
      Alert.alert('Take off failed', error instanceof Error ? error.message : String(error));
    }
  };

  const handleAbort = async () => {
    try {
      await setParam('mission.state', 2);
      // Keep whatever was captured up to the abort -- a cut-short flight is
      // still real data, and often the more interesting kind.
      const n = await stopFlightRecording(`Aborted ${new Date().toLocaleString()}`);
      if (n > 0) Alert.alert('Partial flight saved', `${n} samples kept.`);
    } catch (error) {
      Alert.alert('Abort failed', error instanceof Error ? error.message : String(error));
    } finally {
      setFlying(false);
    }
  };

  const canTakeOff = status.level === 'ready' && !flying;

  const localStyles = useMemo(() => createLocalStyles(palette), [palette]);

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <Header />

      <View style={[styles.bodyContainer, { padding: spacing.lg }]}>
        <Text style={styles.label}>Pre-Flight Checklist</Text>

        <View
          style={[
            localStyles.statusBlock,
            { backgroundColor: STATUS_BG[status.level], borderLeftColor: STATUS_COLOR[status.level] },
          ]}
        >
          <Text style={[localStyles.statusText, { color: STATUS_COLOR[status.level] }]}>
            {'●'} {status.message.toUpperCase()}
          </Text>
          {status.subMessage && <Text style={localStyles.statusSubText}>{status.subMessage}</Text>}
        </View>

        <View style={localStyles.card}>
          <Text style={localStyles.fieldLabel}>Hover Time (seconds)</Text>
          <TextInput
            onChangeText={(text) => setTimer(Number(text))}
            keyboardType="numeric"
            value={timer.toString()}
            style={localStyles.input}
            placeholderTextColor={palette.textMuted}
          />

          <Text style={localStyles.fieldLabel}>Max Altitude (mm)</Text>
          <TextInput
            onChangeText={(text) => setHeight(Number(text))}
            keyboardType="numeric"
            value={height.toString()}
            style={localStyles.input}
            placeholderTextColor={palette.textMuted}
          />

          <Text style={localStyles.fieldLabel}>Measure Distance (cm)</Text>
          <TextInput
            onChangeText={(text) => setSampleDist(Number(text))}
            keyboardType="numeric"
            value={sampleDist.toString()}
            style={localStyles.input}
            placeholderTextColor={palette.textMuted}
          />

          <Text style={localStyles.fieldLabel}>Flight Mode</Text>
          <View style={localStyles.modeRow}>
            <TouchableOpacity
              style={[
                localStyles.modeButton,
                !wallFollow
                  ? { borderColor: palette.ready, backgroundColor: alpha(palette.ready, 0.12) }
                  : { borderColor: palette.border, backgroundColor: palette.surface },
              ]}
              onPress={() => setWallFollow(false)}
            >
              <Text style={[localStyles.modeText, { color: !wallFollow ? palette.ready : palette.textMuted }]}>
                HOVER
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                localStyles.modeButton,
                wallFollow
                  ? { borderColor: palette.ready, backgroundColor: alpha(palette.ready, 0.12) }
                  : { borderColor: palette.border, backgroundColor: palette.surface },
              ]}
              onPress={() => setWallFollow(true)}
            >
              <Text style={[localStyles.modeText, { color: wallFollow ? palette.ready : palette.textMuted }]}>
                FOLLOW WALL
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={localStyles.modeHint}>
            {wallFollow
              ? 'Start with a wall on the drone’s RIGHT, about 40cm away, nose pointing along it. It flies out for half the timer, then retraces its route home. It cannot turn corners.'
              : 'Climbs, holds position for the timer, lands.'}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            localStyles.takeOffButton,
            canTakeOff
              ? { borderColor: palette.ready, backgroundColor: alpha(palette.ready, 0.12) }
              : { borderColor: palette.borderStrong, backgroundColor: palette.surface },
          ]}
          onPress={handleTakeOff}
          disabled={!canTakeOff}
        >
          <Text style={[localStyles.buttonText, { color: canTakeOff ? palette.ready : palette.textMuted }]}>
            {flying ? 'Mission In Progress' : 'Take Off'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            localStyles.abortButton,
            isConnected
              ? { borderColor: palette.fault, backgroundColor: alpha(palette.fault, 0.12) }
              : { borderColor: palette.borderStrong, backgroundColor: palette.surface },
          ]}
          onPress={handleAbort}
          disabled={!isConnected}
        >
          <Text style={[localStyles.buttonText, { color: isConnected ? palette.fault : palette.textMuted }]}>
            Abort
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaProvider>
  );
}

function createLocalStyles(palette: Palette) {
  return StyleSheet.create({
    statusBlock: {
      borderLeftWidth: 3,
      borderRadius: radius.sm,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    statusText: {
      fontFamily: type.fontFamily,
      fontSize: type.md,
      fontWeight: 'bold',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    statusSubText: {
      fontFamily: type.fontFamily,
      fontSize: type.xs,
      color: palette.textSecondary,
      marginTop: spacing.xs,
    },
    card: {
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    fieldLabel: {
      fontFamily: type.fontFamily,
      fontSize: type.micro,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: palette.textMuted,
      marginBottom: spacing.sm,
    },
    input: {
      backgroundColor: palette.surfaceRaised,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.lg,
      fontFamily: type.fontFamily,
      fontSize: type.readout,
      color: palette.textPrimary,
    },
    modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  modeText: {
    fontFamily: type.fontFamily,
    fontSize: type.sm,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  modeHint: {
    fontFamily: type.fontFamily,
    color: palette.textMuted,
    fontSize: type.micro,
    marginTop: spacing.sm,
  },
  takeOffButton: {
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingVertical: spacing.lg,
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    abortButton: {
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    buttonText: {
      fontFamily: type.fontFamily,
      fontSize: type.sm,
      fontWeight: 'bold',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
  });
}
