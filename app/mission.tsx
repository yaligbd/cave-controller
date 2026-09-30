// ===========================================================================
//  FLIGHT-CRITICAL FILE.  THIS SCREEN LAUNCHES THE DRONE.
// ===========================================================================
//
// Pressing Take Off here writes mission.state = 1, and the drone leaves the
// ground straight away. There is no confirmation step between the button and
// the motors. Treat every path that reaches handleTakeOff as live.
//
// The drone cannot be tested against right now. Assume any change here is
// unverifiable until it is back.
//
// WHAT THIS SCREEN SENDS, AND WHY THE ORDER MATTERS
//
//   mission.timer       how long the flight lasts, in seconds
//   mission.height      hover altitude, in mm
//   mission.sampledist  recording spacing
//   mission.wallfollow  0 = hover, 1 = follow the wall on the RIGHT,
//                       2 = follow the wall on the LEFT
//   mission.state = 1   GO. Everything above must already be set.
//
// The settings are written BEFORE the state, and the state is written last on
// purpose. Reordering this launches the drone on whatever settings happened to
// be left over from the previous mission.
//
// mission.wallfollow IS WRITTEN ON EVERY TAKEOFF, INCLUDING WHEN IT IS 0.
// The firmware defaults it to 0, but a mission earlier in the same power cycle
// may have left it at 1 or 2. A drone that follows a wall when the pilot asked
// for a hover, or follows the wrong wall, is the worse of the two ways to be
// wrong, so the mode is always sent explicitly. Do not "optimise" that into
// only sending it when it is non-zero.
//
// The recorder is started BEFORE mission.state, so the climb is captured from
// the first moment rather than from wherever the drone has already got to.
//
// THE ABORT BUTTON IS REAL SAFETY EQUIPMENT.
// It writes mission.state = 2 and the drone lands where it is. It has been
// tested in flight and it works. Do not put anything in front of it -- no
// confirmation dialog, no disabled state, no debounce that could swallow the
// press. It needs to work on the first tap while something is going wrong.
//
// FLIGHT MODE
// Three modes, and the button values ARE the wire values (0, 1, 2) so there is
// no mapping table here to fall out of step with the firmware.
//
//   HOVER       climbs, holds for the timer, lands
//   WALL RIGHT  follows a wall on the drone's right for half the timer,
//               then retraces its own route home
//   WALL LEFT   the exact mirror of WALL RIGHT
//
// If the connected firmware has no mission.wallfollow, choosing either wall
// mode refuses to take off and says so. Flying a silent hover instead is the
// exact failure that guard was added for, and it cost a flight to find.
//
// The setup text under the control is not decoration. The wall must be on the
// side the mode names, about 40cm away, with the nose pointing along it. Wrong
// placement is the difference between a flight and a crash, and there is no way
// for the app to check it.
// ===========================================================================

import Header from '@/components/Header';
import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useDialog } from '@/contexts/DialogContext';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';
import { useTheme } from '@/contexts/ThemeContext';

const TIMER_MIN = 1;
// 120s, up from 45. The recording is the real ceiling: the drone keeps
// MAX_SAMPLES = 180 samples at one a second, and the firmware's own hard
// limit lands it at the timer plus 30s -- so 150 seconds of flight against
// 180 of room. Anything past that would record a flight with its end missing.
const TIMER_MAX = 120;
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
  const dialog = useDialog();
  const { isConnected, bleAvailable, params, tocProgress, setParam, startFlightRecording, stopFlightRecording} = useDroneConnection();

  const [timer, setTimer] = useState(10);
  const [height, setHeight] = useState(500);
  const [sampleDist, setSampleDist] = useState(10);
  // Matches mission.wallfollow in the firmware exactly: 0 hover, 1 right,
  // 2 left. Kept as the wire value rather than a friendlier enum so there is
  // no mapping table to get out of step with the drone.
  //
  // Hover by default. Wall following is the interesting mode but also the one
  // that can fly into something, so it is chosen deliberately rather than
  // left on from last time.
  const FLIGHT_MODES = [
    { value: 0, label: 'HOVER',      hint: 'Climbs, holds position for the timer, lands.' },
    { value: 1, label: 'WALL RIGHT', hint: 'Start with the wall on the drone’s RIGHT, about 40cm away, nose pointing along it. It follows the wall for half the timer, then retraces its route home.' },
    { value: 2, label: 'WALL LEFT',  hint: 'The mirror of WALL RIGHT. Start with the wall on the drone’s LEFT, about 40cm away, nose pointing along it.' },
  ];
  const [flightMode, setFlightMode] = useState(0);
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
      await dialog.error('Invalid input', validationError);
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
        await setParam('mission.wallfollow', flightMode);
      } else if (flightMode !== 0) {
        // Say so rather than flying a hover and leaving the pilot to wonder
        // why the drone ignored them. This is exactly what happened once:
        // the firmware had the parameter, the app had no way to set it, and
        // the flight looked identical to a normal hover with no explanation.
        await dialog.error(
          'This firmware cannot wall follow',
          'The drone would simply hover instead of following a wall. Flash the mission firmware first.',
          'mission.wallfollow is missing from the parameter table of the connected firmware.'
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
          await dialog.notify(
            'Flight saved',
            `${n} samples recorded. Open the Simulator screen to view it in 3D, rename it, or delete it.`,
            { variant: 'success' }
          );
        } else {
          await dialog.notify(
            'Nothing recorded',
            'No usable samples were captured. Check that the drone is connected and streaming telemetry.',
            { variant: 'warn' }
          );
        }
      }, totalMs);
    } catch (error) {
      await dialog.error(
        'Take off failed',
        'The drone did not accept the mission. It has not taken off.',
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const handleAbort = async () => {
    try {
      await setParam('mission.state', 2);
      // Keep whatever was captured up to the abort -- a cut-short flight is
      // still real data, and often the more interesting kind.
      const n = await stopFlightRecording(`Aborted ${new Date().toLocaleString()}`);
      if (n > 0) {
        await dialog.notify('Partial flight saved', `${n} samples kept from the aborted flight.`, {
          variant: 'success',
        });
      }
    } catch (error) {
      await dialog.error(
        'Abort failed',
        'The abort command was not acknowledged. The drone may still be flying — be ready to catch it.',
        error instanceof Error ? error.message : String(error)
      );
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
            {FLIGHT_MODES.map((m) => {
              const on = flightMode === m.value;
              return (
                <TouchableOpacity
                  key={m.value}
                  style={[
                    localStyles.modeButton,
                    on
                      ? { borderColor: palette.ready, backgroundColor: alpha(palette.ready, 0.12) }
                      : { borderColor: palette.border, backgroundColor: palette.surface },
                  ]}
                  onPress={() => setFlightMode(m.value)}
                >
                  <Text style={[localStyles.modeText, { color: on ? palette.ready : palette.textMuted }]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={localStyles.modeHint}>
            {FLIGHT_MODES[flightMode].hint}
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
    // Smaller than the other buttons: three labels have to share one row on a
    // phone, and "WALL RIGHT" must not wrap.
    fontSize: type.xs,
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
