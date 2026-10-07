import Header from '@/components/Header';
import Button from '@/components/ui/Button';
import Reveal from '@/components/ui/Reveal';
import Screen from '@/components/ui/Screen';
import Surface from '@/components/ui/Surface';
import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDialog } from '@/contexts/DialogContext';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { clearLog } from '@/services/ErrorLog';
import { uploadFlights } from '@/services/CaveBatServer';
import { deleteAllFlights, listFlights } from '@/services/FlightStore';
import { Prefs, setPref, subscribeToPrefs } from '@/services/Prefs';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface TunableConfig {
  fullName: string;
  label: string;
  step: number;
  defaultValue: number;
  decimals: number;
}

// Candidate tunable parameters. A row is only rendered if the connected
// drone's parameter TOC actually reports the name.
const TUNABLE_PARAMS: TunableConfig[] = [
  { fullName: 'mission.height', label: 'Hover Altitude (mm)', step: 50, defaultValue: 500, decimals: 0 },
  { fullName: 'mission.maxtime', label: 'Max Flight Time (s)', step: 10, defaultValue: 120, decimals: 0 },
  { fullName: 'mission.vbatmin', label: 'Min Battery Voltage (V)', step: 0.1, defaultValue: 3.0, decimals: 2 },
];

export default function SettingsScreen() {
  const { styles, palette, mode, toggleMode } = useTheme();
  const { isConnected, params, setParam } = useDroneConnection();
  const dialog = useDialog();

  const [prefs, setPrefs] = useState<Prefs>({ keepFlights: true, keepErrors: true });
  useEffect(() => subscribeToPrefs(setPrefs), []);
  const { account, signOut } = useAuth();

  const [tuningValues, setTuningValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(TUNABLE_PARAMS.map((p) => [p.fullName, p.defaultValue]))
  );

  const availableTuningParams = TUNABLE_PARAMS.filter((p) => params.has(p.fullName));

  const handleTuningChange = (config: TunableConfig, value: number) => {
    setTuningValues((prev) => ({ ...prev, [config.fullName]: value }));
    setParam(config.fullName, value).catch((error) => {
      console.error(`[settings] Failed to sync ${config.fullName}:`, error);
    });
  };

  const handleDeleteFlights = async () => {
    const yes = await dialog.confirm(
      'Delete every saved flight?',
      'All flights stored on this phone are removed permanently. A flight that has ' +
        'already been downloaded cannot be fetched from the drone again -- the drone ' +
        'keeps only its most recent one.',
      { destructive: true, confirmLabel: 'Delete flights' }
    );
    if (!yes) return;
    const ok = await deleteAllFlights();
    await dialog.notify(
      ok ? 'Flights deleted' : 'Could not delete',
      ok
        ? 'Every saved flight has been removed from this phone.'
        : 'Something went wrong removing the saved flights. They may still be there.',
      { variant: ok ? 'info' : 'warn' }
    );
  };

  // Sends every flight on the phone to the signed-in account. Only reads
  // local storage, never changes it, and the server ignores a flight it
  // already has -- so this is safe to press any number of times.
  const [uploading, setUploading] = useState(false);
  const handleUploadFlights = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const flights = await listFlights();
      if (!flights.length) {
        await dialog.notify('Nothing to upload', 'There are no flights saved on this phone.');
        return;
      }
      const sent = await uploadFlights(flights);
      const missing = flights.length - sent;
      await dialog.notify(
        missing ? 'Some flights were not uploaded' : 'All flights uploaded',
        missing
          ? `${sent} of ${flights.length} flights are on the server. The other ${missing} are still ` +
              'only on this phone: check the internet connection and that you are signed in, then ' +
              'try again. The log says why each one failed.'
          : `All ${flights.length} flights on this phone are on the server. They also stay here.`,
        { variant: missing ? 'warn' : 'info' }
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteLog = async () => {
    const yes = await dialog.confirm(
      'Clear the fault log?',
      'Every recorded fault is removed, on screen and in storage.',
      { destructive: true, confirmLabel: 'Clear log' }
    );
    if (!yes) return;
    clearLog();
    await dialog.notify('Fault log cleared', 'The log is empty.');
  };

  const handleSignOut = async () => {
    const yes = await dialog.confirm(
      'Sign out?',
      'Your saved flights stay on this phone. You can sign back in at any time.',
      { confirmLabel: 'Sign out' }
    );
    if (yes) await signOut();
  };

  const localStyles = useMemo(() => createLocalStyles(palette), [palette]);

  const renderTuningRow = (config: TunableConfig) => {
    const value = tuningValues[config.fullName];
    return (
      <Surface key={config.fullName} style={localStyles.tuningCard}>
        <Text style={localStyles.fieldLabel}>{config.label}</Text>
        <View style={localStyles.tuningControls}>
          <TouchableOpacity
            style={localStyles.stepButton}
            onPress={() => handleTuningChange(config, Number((value - config.step).toFixed(config.decimals)))}
          >
            <Text style={localStyles.stepButtonText}>-</Text>
          </TouchableOpacity>

          <TextInput
            style={localStyles.valueInput}
            keyboardType="numeric"
            value={value.toFixed(config.decimals)}
            onChangeText={(text) => {
              const num = parseFloat(text);
              if (!isNaN(num)) handleTuningChange(config, num);
            }}
          />

          <TouchableOpacity
            style={localStyles.stepButton}
            onPress={() => handleTuningChange(config, Number((value + config.step).toFixed(config.decimals)))}
          >
            <Text style={localStyles.stepButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </Surface>
    );
  };

  return (
    <Screen>
      <Header />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text style={styles.label}>Settings</Text>

        {/* ---------- ACCOUNT ---------- */}
        <Text style={localStyles.sectionTitle}>Account</Text>
        <Reveal index={0}>
        <Surface level="md" style={localStyles.card}>
          <Text style={localStyles.cardHeading}>{account?.displayName ?? 'Not signed in'}</Text>
          <Text style={localStyles.bodyText}>{account?.email ?? '—'}</Text>
          <Text style={localStyles.captionText}>
            The same account as on the website. Every new flight is saved on this phone and
            uploaded to it. Flights saved before uploading existed go up with the button below.
          </Text>
          <Button
            label={uploading ? 'Uploading…' : 'Upload all flights to server'}
            tint={palette.accent}
            variant="outline"
            onPress={handleUploadFlights}
          />
          <Button label="Sign out" tint={palette.fault} variant="outline" onPress={handleSignOut} />
        </Surface>
        </Reveal>

        {/* ---------- a) HARDWARE SETUP ---------- */}
        <Text style={localStyles.sectionTitle}>Hardware Setup</Text>
        <Surface style={localStyles.card}>
          <Text style={localStyles.bodyText}>• Ensure your Crazyflie is fully charged.</Text>
          <Text style={localStyles.bodyText}>
            • <Text style={{ fontWeight: 'bold', color: palette.warn }}>Prerequisite:</Text> Ensure your Crazyflie
            has a Flow Deck and Multi-ranger Deck attached.
          </Text>
          <Text style={[localStyles.bodyText, { marginBottom: 0 }]}>
            • Keep the drone close to the phone when connecting over Bluetooth.
          </Text>
        </Surface>
        <Surface style={localStyles.card}>
          <Text style={localStyles.cardHeading}>Flashing the firmware</Text>
          <Text style={localStyles.bodyText}>
            CaveBat firmware is flashed once from a PC over a Crazyradio, using{' '}
            <Text style={{ fontWeight: 'bold', color: palette.accent }}>make cload</Text>. This app does not flash
            firmware.
          </Text>
          <Text style={[localStyles.captionText, { marginBottom: 0 }]}>
            Over-the-air flashing from the phone is planned for a later phase.
          </Text>
        </Surface>

        {/* ---------- b) LIVE TUNING ---------- */}
        <Text style={localStyles.sectionTitle}>Live Tuning</Text>
        <Text style={localStyles.captionText}>
          Adjusting these parameters updates the drone&apos;s memory live over CRTP while it is connected and
          idling.
        </Text>

        {!isConnected && (
          <Surface tone="glass" style={localStyles.warningBanner}>
            <Text style={localStyles.warningText}>
              Warning: Drone not connected. Changes will not be synced to the Crazyflie.
            </Text>
          </Surface>
        )}

        {availableTuningParams.length === 0 ? (
          <Text style={localStyles.emptyText}>No tunable parameters were found on the connected drone.</Text>
        ) : (
          availableTuningParams.map(renderTuningRow)
        )}

        {/* ---------- c) APPEARANCE ---------- */}
        <Text style={localStyles.sectionTitle}>Appearance</Text>
        <Surface style={[localStyles.card, localStyles.toggleRow]}>
          <Text style={localStyles.rowText}>Day mode</Text>
          <Switch
            value={mode === 'day'}
            onValueChange={toggleMode}
            trackColor={{ false: palette.borderStrong, true: palette.accent }}
            thumbColor={mode === 'day' ? palette.accent : palette.textMuted}
          />
        </Surface>

        {/* ---------- d) OFFLINE MODE ---------- */}
        <Text style={localStyles.sectionTitle}>Offline Mode</Text>
        <Surface style={[localStyles.card, localStyles.toggleRow]}>
          <Text style={localStyles.rowText}>Not implemented</Text>
          <Switch
            value={false}
            disabled
            trackColor={{ false: palette.borderStrong, true: palette.borderStrong }}
            thumbColor={palette.textMuted}
          />
        </Surface>

        {/* ---------- e) DATA ----------
            Switching a toggle OFF stops new records being written. It does NOT
            delete what is already stored -- that is the button below it, and
            keeping the two apart is deliberate: losing a morning's flights to a
            mis-tapped switch would be unforgivable. */}
        <Text style={localStyles.sectionTitle}>Data</Text>

        <Surface style={[localStyles.card, localStyles.toggleRow]}>
          <View style={{ flex: 1, marginRight: spacing.md }}>
            <Text style={[localStyles.rowText, { marginBottom: 2 }]}>Keep flights</Text>
            <Text style={localStyles.captionText}>
              Store downloaded flights on this phone. Off: a flight is still drawn after
              it is downloaded, but is gone when you leave the screen.
            </Text>
          </View>
          <Switch
            value={prefs.keepFlights}
            onValueChange={(v) => setPref('keepFlights', v)}
            trackColor={{ false: palette.borderStrong, true: palette.accent }}
            thumbColor={prefs.keepFlights ? palette.accent : palette.textMuted}
          />
        </Surface>

        <Surface style={[localStyles.card, localStyles.toggleRow]}>
          <View style={{ flex: 1, marginRight: spacing.md }}>
            <Text style={[localStyles.rowText, { marginBottom: 2 }]}>Keep fault log</Text>
            <Text style={localStyles.captionText}>
              Keep recorded faults, with their times, between sessions. Off: the log is
              cleared every time the app restarts.
            </Text>
          </View>
          <Switch
            value={prefs.keepErrors}
            onValueChange={(v) => setPref('keepErrors', v)}
            trackColor={{ false: palette.borderStrong, true: palette.accent }}
            thumbColor={prefs.keepErrors ? palette.accent : palette.textMuted}
          />
        </Surface>

        {/* Outline rather than solid, and both confirm first. A solid red
            button invites the tap; these two should not. */}
        <Button
          label="Delete all flights"
          tint={palette.fault}
          variant="outline"
          onPress={handleDeleteFlights}
          style={{ marginBottom: spacing.md }}
        />
        <Button label="Clear fault log" tint={palette.fault} variant="outline" onPress={handleDeleteLog} />
      </ScrollView>
    </Screen>
  );
}

function createLocalStyles(palette: Palette) {
  return StyleSheet.create({
    sectionTitle: {
      fontFamily: type.sansMedium,
      color: palette.textMuted,
      fontSize: type.xs,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },
    // Surface draws the fill, border, radius and shadow.
    card: {
      marginBottom: spacing.md,
    },
    cardHeading: {
      fontFamily: type.sansMedium,
      color: palette.textPrimary,
      fontSize: type.lg,
      fontWeight: '700',
      marginBottom: spacing.sm,
    },
    bodyText: {
      fontFamily: type.sans,
      color: palette.textSecondary,
      fontSize: type.sm,
      lineHeight: type.sm * 1.5,
      marginBottom: spacing.sm,
    },
    /** A settings row's own label: darker and heavier than running prose. */
    rowText: {
      fontFamily: type.sansMedium,
      color: palette.textPrimary,
      fontSize: type.md,
    },
    captionText: {
      fontFamily: type.sans,
      color: palette.textMuted,
      fontSize: type.xs,
      lineHeight: type.xs * 1.5,
      marginBottom: spacing.md,
    },
    warningBanner: {
      backgroundColor: alpha(palette.fault, 0.14),
      borderColor: palette.fault,
      marginBottom: spacing.md,
    },
    warningText: {
      fontFamily: type.sansMedium,
      color: palette.fault,
      textAlign: 'center',
      fontWeight: '700',
      fontSize: type.sm,
    },
    emptyText: {
      fontFamily: type.sans,
      color: palette.textMuted,
      textAlign: 'center',
      fontSize: type.sm,
      marginBottom: spacing.md,
    },
    tuningCard: {
      marginBottom: spacing.md,
    },
    fieldLabel: {
      fontFamily: type.sansMedium,
      fontSize: type.xs,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: palette.textMuted,
      marginBottom: spacing.md,
    },
    tuningControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    // Round, like the keypad's own steppers, so the same gesture looks the
    // same wherever a number is nudged.
    stepButton: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: alpha(palette.accent, 0.14),
      borderWidth: 1,
      borderColor: alpha(palette.accent, 0.4),
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepButtonText: {
      fontFamily: type.sansMedium,
      color: palette.accent,
      fontSize: type.xl,
      fontWeight: '700',
      lineHeight: type.xl + 2,
    },
    valueInput: {
      backgroundColor: palette.surfaceRaised,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      width: 120,
      textAlign: 'center',
      fontFamily: type.mono,
      fontSize: type.readout,
      color: palette.textPrimary,
    },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
  });
}
