import Header from '@/components/Header';
import { styles } from '@/constants/theme';
import { useDroneConnection } from '@/contexts/DroneConnectionContext';
import { OtaService } from '@/services/OtaService';
import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function SetupScreen() {
  const { isConnected, connectedDevice } = useDroneConnection();
  const [progress, setProgress] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);

  const startOTA = async () => {
    if (!isConnected || !connectedDevice) {
      Alert.alert("Not Connected", "Please connect to the drone first.");
      return;
    }

    try {
      setIsFlashing(true);
      setProgress(0);

      // 1. Send command to reboot drone into Bootloader
      await OtaService.rebootToBootloader(connectedDevice);
      
      // Normally the BLE connection drops here, and we scan for "Crazyflie Loader"
      // For UX simulation, we assume the bootloader connection is handled via connectedDevice.

      // 2. Read compiled firmware file (.bin)
     const fwBytes = await OtaService.readFirmwareFile();

      // 3. Upload chunks to flash memory
      await OtaService.uploadFirmwareChunks(connectedDevice, fwBytes, (p) => {
        setProgress(p);
      });

      // 4. Send command to reboot back to standard firmware
      await OtaService.rebootToFirmware(connectedDevice);

      Alert.alert("Success", "Autonomous Brain installed successfully! Drone is rebooting.");
    } catch (e: any) {
      Alert.alert("OTA Error", e.message || "Failed to flash firmware.");
    } finally {
      setIsFlashing(false);
      setProgress(0);
    }
  };

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <Header />
      <View style={[styles.bodyContainer, { alignItems: 'center', justifyContent: 'center', flex: 1 }]}>
        
        <View style={{ backgroundColor: '#222', padding: 25, borderRadius: 15, width: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 }}>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>
            Hardware Setup
          </Text>
          
          <View style={{ backgroundColor: '#333', padding: 15, borderRadius: 10, marginBottom: 25 }}>
            <Text style={{ color: '#ddd', fontSize: 16, marginBottom: 8 }}>
              • Ensure your Crazyflie is fully charged.
            </Text>
            <Text style={{ color: '#ddd', fontSize: 16, marginBottom: 8 }}>
              • <Text style={{ fontWeight: 'bold', color: '#ffeb3b' }}>Prerequisite:</Text> Ensure your Crazyflie has a Flow Deck and Multi-ranger Deck attached.
            </Text>
            <Text style={{ color: '#ddd', fontSize: 16 }}>
              • Keep the drone close to the phone during OTA flash.
            </Text>
          </View>

          {isFlashing ? (
            <View style={{ alignItems: 'center', marginTop: 10 }}>
              <Text style={{ color: '#00e5ff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
                Flashing Firmware... {Math.round(progress)}%
              </Text>
              <View style={{ width: '100%', height: 12, backgroundColor: '#444', borderRadius: 6, overflow: 'hidden' }}>
                <View style={{ width: `${progress}%`, height: '100%', backgroundColor: '#00e5ff' }} />
              </View>
            </View>
          ) : (
<TouchableOpacity 
  style={{ backgroundColor: isConnected ? '#00e5ff' : '#6c757d', padding: 18, borderRadius: 10, marginTop: 10 }}
  onPress={startOTA}
>
              <Text style={{ color: isConnected ? '#000' : '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: 16 }}>
                Install Autonomous Brain to Drone
              </Text>
            </TouchableOpacity>
          )}

          {!isConnected && !isFlashing && (
             <Text style={{ color: '#ff4444', marginTop: 15, textAlign: 'center', fontWeight: '600' }}>
               * Connect to the drone on the 3D Screen first.
             </Text>
          )}
        </View>

      </View>
    </SafeAreaProvider>
  );
}
