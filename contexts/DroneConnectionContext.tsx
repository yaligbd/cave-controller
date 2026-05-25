import React, { createContext, useContext, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

// Official Bitcraze CRTP UUIDs
export const CRAZYFLIE_SERVICE = '00000201-1c7f-4f9e-947b-43b7c00a9a08';
export const CRAZYFLIE_RX = '00000202-1c7f-4f9e-947b-43b7c00a9a08';

const bleManager = new BleManager();

interface DroneContextType {
  isConnected: boolean;
  connectedDevice: Device | null;
  scanForDrone: () => Promise<void>;
  disconnectFromDrone: () => Promise<void>; // <-- Added this
}

const DroneContext = createContext<DroneContextType | null>(null);

export function DroneConnectionProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);

  const requestAndroidPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return (
        granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    return true;
  };

  const connectToDrone = async (device: Device) => {
    try {
      console.log(`Connecting to ${device.name}...`);
      const connected = await device.connect();
      console.log("✅ Connected! Discovering services...");
      await connected.discoverAllServicesAndCharacteristics();
      
      setConnectedDevice(connected);
      setIsConnected(true);
      console.log("🚀 DRONE IS FULLY CONNECTED AND READY!");

      // --- NEW: The Disconnect Listener ---
      // This fires automatically if the drone turns off or flies out of range
      connected.onDisconnected((error, disconnectedDevice) => {
        console.log(`⚠️ Drone Disconnected: ${disconnectedDevice.name}`);
        setIsConnected(false);
        setConnectedDevice(null);
      });

    } catch (error) {
      console.error("❌ Connection failed:", error);
    }
  };

// --- UPDATED: The Manual Disconnect Function ---
  const disconnectFromDrone = async () => {
    if (connectedDevice) {
      try {
        console.log(`Disconnecting from ${connectedDevice.name}...`);
        
        // 1. Immediately update the UI so the user isn't left hanging
        setIsConnected(false);
        setConnectedDevice(null);

        // 2. Tell the hardware to sever the connection
        await connectedDevice.cancelConnection();
        console.log("✅ Successfully disconnected.");
        
      } catch (error) {
        console.error("❌ Error while disconnecting:", error);
      }
    } else {
      console.log("No device is currently connected to disconnect from.");
    }
  };

  const scanForDrone = async () => {
    console.log("--- SCAN BUTTON PRESSED ---");
    const hasPermission = await requestAndroidPermissions();
    
    if (!hasPermission) return;

    console.log("✅ Permissions granted. Starting BLE Scan...");

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) return;

      const droneName = device?.name || device?.localName;
      if (droneName && droneName.includes('Crazyflie')) {
        console.log(`🎉 FOUND THE DRONE! Name: ${droneName}`);
        bleManager.stopDeviceScan();
        connectToDrone(device);
      }
    });
  };

  return (
    <DroneContext.Provider value={{ isConnected, connectedDevice, scanForDrone, disconnectFromDrone }}>
      {children}
    </DroneContext.Provider>
  );
}

export function useDroneConnection() {
  const context = useContext(DroneContext);
  if (!context) throw new Error('useDroneConnection must be used within DroneConnectionProvider');
  return context;
}