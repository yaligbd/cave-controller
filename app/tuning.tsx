import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Header from '@/components/Header';
import { styles } from '@/constants/theme';
import { useDroneConnection, CRAZYFLIE_SERVICE, CRAZYFLIE_RX } from '@/contexts/DroneConnectionContext';
import { CrtpService } from '@/services/CrtpService';

// Dummy CRTP Parameter IDs for the new tuning parameters
const PARAM_KP_WALL = 4;
const PARAM_KP_CEILING = 5;
const PARAM_TARGET_WALL = 6;
const PARAM_TARGET_CEILING = 7;
const PARAM_MAX_V = 8;

export default function TuningScreen() {
  const { isConnected, connectedDevice } = useDroneConnection();

  // State for tuning variables
  const [kpWall, setKpWall] = useState(0.0015);
  const [kpCeiling, setKpCeiling] = useState(0.0010);
  const [targetWall, setTargetWall] = useState(400);
  const [targetCeiling, setTargetCeiling] = useState(500);
  const [maxV, setMaxV] = useState(0.2);

  // Syncs the parameter over BLE without triggering the state machine
  const syncParameter = async (id: number, value: number, type: 'uint16' | 'float') => {
    if (!isConnected || !connectedDevice) return;
    try {
      const packet = CrtpService.writeParameter(id, value, type);
      await connectedDevice.writeCharacteristicWithoutResponseForService(
        CRAZYFLIE_SERVICE,
        CRAZYFLIE_RX,
        packet
      );
      console.log(`Synced Param ID ${id} -> ${value}`);
    } catch (e) {
      console.error(`Failed to sync param ${id}:`, e);
    }
  };

  // Helper to handle UI updates and BLE syncing concurrently
  const handleTune = (setter: any, val: number, id: number, type: 'uint16' | 'float') => {
    setter(val);
    syncParameter(id, val, type);
  };

  // UI Component for a tuning slider/stepper
  const renderTuningRow = (label: string, value: number, step: number, setter: any, id: number, type: 'uint16' | 'float') => (
    <View style={{ marginBottom: 20, backgroundColor: '#222', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }}>
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        
        <TouchableOpacity 
          style={{ backgroundColor: '#444', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 }}
          onPress={() => handleTune(setter, Number((value - step).toFixed(4)), id, type)}
        >
          <Text style={{ color: '#00e5ff', fontSize: 24, fontWeight: 'bold' }}>-</Text>
        </TouchableOpacity>

        <TextInput
          style={{ backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8, width: 100, textAlign: 'center', fontWeight: 'bold', fontSize: 18, color: '#000' }}
          keyboardType="numeric"
          value={value.toString()}
          onChangeText={(text) => {
            const num = parseFloat(text);
            if (!isNaN(num)) handleTune(setter, num, id, type);
          }}
        />

        <TouchableOpacity 
          style={{ backgroundColor: '#444', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 }}
          onPress={() => handleTune(setter, Number((value + step).toFixed(4)), id, type)}
        >
          <Text style={{ color: '#00e5ff', fontSize: 24, fontWeight: 'bold' }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <Header />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        
        <Text style={{ color: '#00e5ff', fontSize: 28, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' }}>
          Live PID Tuning
        </Text>
        <Text style={{ color: '#aaa', fontSize: 14, marginBottom: 25, textAlign: 'center', paddingHorizontal: 10 }}>
          Adjusting these parameters will update the drone's memory live over CRTP while it is connected and idling.
        </Text>

        {!isConnected && (
          <View style={{ backgroundColor: 'rgba(255, 68, 68, 0.1)', padding: 10, borderRadius: 8, marginBottom: 20 }}>
            <Text style={{ color: '#ff4444', textAlign: 'center', fontWeight: 'bold' }}>
              Warning: Drone not connected. Changes will not be synced to the Crazyflie.
            </Text>
          </View>
        )}

        {renderTuningRow("Right Wall P-Gain (kp_wall)", kpWall, 0.0005, setKpWall, PARAM_KP_WALL, 'float')}
        {renderTuningRow("Ceiling P-Gain (kp_ceiling)", kpCeiling, 0.0005, setKpCeiling, PARAM_KP_CEILING, 'float')}
        {renderTuningRow("Target Wall Distance (mm)", targetWall, 50, setTargetWall, PARAM_TARGET_WALL, 'uint16')}
        {renderTuningRow("Target Ceiling Distance (mm)", targetCeiling, 50, setTargetCeiling, PARAM_TARGET_CEILING, 'uint16')}
        {renderTuningRow("Max Forward Velocity (m/s)", maxV, 0.05, setMaxV, PARAM_MAX_V, 'float')}

      </ScrollView>
    </SafeAreaProvider>
  );
}
