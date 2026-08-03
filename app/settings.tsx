import Header from '@/components/Header';
import { alpha, Palette, radius, spacing, type } from '@/constants/theme';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';
import { useTheme } from '@/contexts/ThemeContext';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

  const handleDeleteAllData = () => {
    Alert.alert(
      'Delete all data?',
      'This will permanently delete all locally stored data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Nothing to delete', 'No local data is stored yet.');
          },
        },
      ]
    );
  };

  const localStyles = useMemo(() => createLocalStyles(palette), [palette]);

  const renderTuningRow = (config: TunableConfig) => {
    const value = tuningValues[config.fullName];
    return (
      <View key={config.fullName} style={localStyles.tuningCard}>
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
      </View>
    );
  };

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <Header />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {/* ---------- a) HARDWARE SETUP ---------- */}
        <Text style={localStyles.sectionTitle}>Hardware Setup</Text>
        <View style={localStyles.card}>
          <Text style={localStyles.bodyText}>• Ensure your Crazyflie is fully charged.</Text>
          <Text style={localStyles.bodyText}>
            • <Text style={{ fontWeight: 'bold', color: palette.warn }}>Prerequisite:</Text> Ensure your Crazyflie
            has a Flow Deck and Multi-ranger Deck attached.
          </Text>
          <Text style={[localStyles.bodyText, { marginBottom: 0 }]}>
            • Keep the drone close to the phone when connecting over Bluetooth.
          </Text>
        </View>
        <View style={localStyles.card}>
          <Text style={localStyles.cardHeading}>Flashing the firmware</Text>
          <Text style={localStyles.bodyText}>
            CaveBat firmware is flashed once from a PC over a Crazyradio, using{' '}
            <Text style={{ fontWeight: 'bold', color: palette.accent }}>make cload</Text>. This app does not flash
            firmware.
          </Text>
          <Text style={[localStyles.captionText, { marginBottom: 0 }]}>
            Over-the-air flashing from the phone is planned for a later phase.
          </Text>
        </View>

        {/* ---------- b) LIVE TUNING ---------- */}
        <Text style={localStyles.sectionTitle}>Live Tuning</Text>
        <Text style={localStyles.captionText}>
          Adjusting these parameters updates the drone&apos;s memory live over CRTP while it is connected and
          idling.
        </Text>

        {!isConnected && (
          <View style={localStyles.warningBanner}>
            <Text style={localStyles.warningText}>
              Warning: Drone not connected. Changes will not be synced to the Crazyflie.
            </Text>
          </View>
        )}

        {availableTuningParams.length === 0 ? (
          <Text style={localStyles.emptyText}>No tunable parameters were found on the connected drone.</Text>
        ) : (
          availableTuningParams.map(renderTuningRow)
        )}

        {/* ---------- c) APPEARANCE ---------- */}
        <Text style={localStyles.sectionTitle}>Appearance</Text>
        <View style={[localStyles.card, localStyles.toggleRow]}>
          <Text style={localStyles.bodyText}>Day mode</Text>
          <Switch
            value={mode === 'day'}
            onValueChange={toggleMode}
            trackColor={{ false: palette.borderStrong, true: palette.accent }}
            thumbColor={mode === 'day' ? palette.accent : palette.textMuted}
          />
        </View>

        {/* ---------- d) OFFLINE MODE ---------- */}
        <Text style={localStyles.sectionTitle}>Offline Mode</Text>
        <View style={[localStyles.card, localStyles.toggleRow]}>
          <Text style={localStyles.bodyText}>Not implemented</Text>
          <Switch
            value={false}
            disabled
            trackColor={{ false: palette.borderStrong, true: palette.borderStrong }}
            thumbColor={palette.textMuted}
          />
        </View>

        {/* ---------- e) DATA ---------- */}
        <Text style={localStyles.sectionTitle}>Data</Text>
        <TouchableOpacity style={localStyles.deleteButton} onPress={handleDeleteAllData}>
          <Text style={localStyles.deleteButtonText}>Delete All Data</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaProvider>
  );
}

function createLocalStyles(palette: Palette) {
  return StyleSheet.create({
    sectionTitle: {
      fontFamily: type.fontFamily,
      color: palette.textMuted,
      fontSize: type.micro,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },
    card: {
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    cardHeading: {
      fontFamily: type.fontFamily,
      color: palette.textPrimary,
      fontSize: type.sm,
      fontWeight: 'bold',
      marginBottom: spacing.sm,
    },
    bodyText: {
      fontFamily: type.fontFamily,
      color: palette.textSecondary,
      fontSize: type.sm,
      marginBottom: spacing.sm,
    },
    captionText: {
      fontFamily: type.fontFamily,
      color: palette.textMuted,
      fontSize: type.xs,
      marginBottom: spacing.md,
    },
    warningBanner: {
      backgroundColor: alpha(palette.fault, 0.1),
      borderWidth: 1,
      borderColor: palette.fault,
      borderRadius: radius.sm,
      padding: spacing.sm,
      marginBottom: spacing.md,
    },
    warningText: {
      fontFamily: type.fontFamily,
      color: palette.fault,
      textAlign: 'center',
      fontWeight: 'bold',
      fontSize: type.xs,
    },
    emptyText: {
      fontFamily: type.fontFamily,
      color: palette.textMuted,
      textAlign: 'center',
      fontSize: type.sm,
      marginBottom: spacing.md,
    },
    tuningCard: {
      marginBottom: spacing.md,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      padding: spacing.lg,
    },
    fieldLabel: {
      fontFamily: type.fontFamily,
      fontSize: type.micro,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: palette.textMuted,
      marginBottom: spacing.md,
    },
    tuningControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    stepButton: {
      backgroundColor: palette.surfaceRaised,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    stepButtonText: {
      fontFamily: type.fontFamily,
      color: palette.accent,
      fontSize: type.lg,
      fontWeight: 'bold',
    },
    valueInput: {
      backgroundColor: palette.surfaceRaised,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      width: 110,
      textAlign: 'center',
      fontFamily: type.fontFamily,
      fontSize: type.readout,
      color: palette.textPrimary,
    },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    deleteButton: {
      borderWidth: 1,
      borderColor: palette.fault,
      backgroundColor: alpha(palette.fault, 0.12),
      borderRadius: radius.sm,
      paddingVertical: spacing.lg,
      alignItems: 'center',
      marginBottom: spacing.xxl,
    },
    deleteButtonText: {
      fontFamily: type.fontFamily,
      color: palette.fault,
      fontSize: type.sm,
      fontWeight: 'bold',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
  });
}
