import Header from '@/components/Header';
import { styles } from '@/constants/theme';
import CheckBox from 'expo-checkbox';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import our hardware connection and CRTP services
import { CRAZYFLIE_RX, CRAZYFLIE_SERVICE, useDroneConnection } from '@/contexts/DroneConnectionContext';
import { CrtpService } from '@/services/CrtpService';

// CRTP Parameter IDs (These must match the internal IDs assigned by the drone's firmware)
const PARAM_MISSION_STATE = 1;  // uint8
const PARAM_MISSION_TIMER = 2;  // uint16
const PARAM_MISSION_RTH = 3;    // uint8

export default function MissionScreen() {
  const { isConnected, connectedDevice } = useDroneConnection();

  // Flight Parameters
  const [missionTimer, setMissionTimer] = useState(60);
  const [missionMaxAltitude, setMissionMaxAltitude] = useState(500); // mm
  const [avoidanceEnabled, setAvoidanceEnabled] = useState(true);
  const [rthEnabled, setRthEnabled] = useState(true);  

  // Helper function to send a single parameter packet
  const sendParameter = async (id: number, value: number, type: 'uint8' | 'uint16' | 'float') => {
    if (!connectedDevice) return;
    const packet = CrtpService.writeParameter(id, value, type);
    await connectedDevice.writeCharacteristicWithoutResponseForService(
      CRAZYFLIE_SERVICE,
      CRAZYFLIE_RX,
      packet
    );
  };

  const startMission = async () => {
    if (!isConnected || !connectedDevice) {
      Alert.alert("No Connection", "Please connect to the drone before starting the mission.");
      return;
    }

    try {
      console.log("Syncing parameters to drone RAM...");

      // 1. Sync the Timer (in seconds)
      await sendParameter(PARAM_MISSION_TIMER, missionTimer, 'uint16');
      
      // 2. Sync the RTH toggle (1 for true, 0 for false)
      await sendParameter(PARAM_MISSION_RTH, rthEnabled ? 1 : 0, 'uint8');

      // (Note: We would sync Max Altitude and Avoidance here if they were exposed in the C code!)
      
      // Wait a tiny bit for the drone to process the parameters
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log("Parameters synced. Sending Takeoff Command!");

      // 3. Flip the state machine to 1 (FLYING) to trigger the autonomous loop
      await sendParameter(PARAM_MISSION_STATE, 1, 'uint8');

      Alert.alert("Mission Started", "The drone is now executing its autonomous sequence.");
    } catch (error) {
      console.error("Failed to start mission:", error);
      Alert.alert("Error", "Failed to communicate with the drone.");
    }
  };

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <Header />
      
      <View style={[styles.bodyContainer, { padding: 20 }]}>
        <Text style={{ color: '#00e5ff', fontSize: 28, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>
          Pre-Flight Checklist
        </Text>

        <View style={localStyles.card}>
          <Text style={localStyles.label}>Mission Timer (Seconds)</Text>
          <TextInput 
            onChangeText={(text) => setMissionTimer(Number(text))} 
            keyboardType='numeric' 
            value={missionTimer.toString()} 
            style={localStyles.input} 
          />

          <Text style={localStyles.label}>Max Altitude Ceiling (mm)</Text>
          <TextInput 
            onChangeText={(text) => setMissionMaxAltitude(Number(text))} 
            keyboardType='numeric' 
            value={missionMaxAltitude.toString()} 
            style={localStyles.input} 
          />

          <View style={localStyles.checkboxRow}>
            <CheckBox 
              style={localStyles.checkbox} 
              value={avoidanceEnabled} 
              onValueChange={setAvoidanceEnabled} 
              color={avoidanceEnabled ? '#00e5ff' : undefined} 
            />
            <Text style={localStyles.checkboxLabel}>Enable Obstacle Avoidance</Text>
          </View>

          <View style={localStyles.checkboxRow}>
            <CheckBox 
              style={localStyles.checkbox} 
              value={rthEnabled} 
              onValueChange={setRthEnabled} 
              color={rthEnabled ? '#00e5ff' : undefined} 
            />
            <Text style={localStyles.checkboxLabel}>Enable Return-To-Home (RTH)</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[localStyles.startButton, { backgroundColor: isConnected ? '#4CAF50' : '#444' }]}
          onPress={startMission}
          disabled={!isConnected}
        >
          <Text style={localStyles.startButtonText}>
            {isConnected ? 'Sync & Start Autonomous Mission' : 'Connect Drone to Start'}
          </Text>
        </TouchableOpacity>

      </View>
    </SafeAreaProvider>
  );
}

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: '#222',
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
  },
  label: {
    color: '#ddd',
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 20,
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  checkbox: {
    marginRight: 10,
    width: 24,
    height: 24,
  },
  checkboxLabel: {
    color: '#fff',
    fontSize: 16,
  },
  startButton: {
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  }
});