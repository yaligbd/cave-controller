import { styles } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

// Import our global Drone Context
import { useDroneConnection } from '@/contexts/DroneConnectionContext';

export default function Header() {
  // Extract the variables we need
  const { isConnected, scanForDrone, disconnectFromDrone } = useDroneConnection();

  // Create a handler function for the Bluetooth button
  const handleBluetoothPress = () => {
    if (isConnected) {
      disconnectFromDrone();
    } else {
      scanForDrone();
    }
  };

  return (
    <View style={styles.headerContainer}>

      {/* LEFT SIDE: The Navigation Options */}
      <Link href="/" asChild>
        <TouchableOpacity>
          <Text style={styles.navText}>3Ds</Text>
        </TouchableOpacity>
      </Link>
      
      <View style={styles.navOptions}>
        <Link href="/mission" asChild>
          <TouchableOpacity>
            <Text style={styles.navText}>Mission</Text>
          </TouchableOpacity>
        </Link>
        
        {/* --- NEW: Setup Screen Link --- */}
        <Link href="/setup" asChild>
          <TouchableOpacity>
            <Text style={styles.navText}>Setup</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/history" asChild>
          <TouchableOpacity>
            <Text style={styles.navText}>History</Text>
          </TouchableOpacity>
        </Link>
      </View>

      {/* RIGHT SIDE: The Icon Buttons */}
      <View style={styles.iconButtons}>
        
        {/* --- NEW: Tuning Screen Link (Replacing Wifi Icon) --- */}
        <Link href="/tuning" asChild>
          <TouchableOpacity style={styles.roundButton}>
            <Ionicons name="options" size={20} color="white" />
          </TouchableOpacity>
        </Link>

        {/* The Bluetooth Connect/Disconnect Button */}
        <TouchableOpacity style={styles.roundButton} onPress={handleBluetoothPress}>
          <Ionicons 
            name="bluetooth" 
            size={20} 
            color={isConnected ? '#00e5ff' : 'white'} 
          />
        </TouchableOpacity>
        
        <Link href="/settings" asChild>
          <TouchableOpacity style={styles.roundButton}>
            <Ionicons name="settings" size={20} color="white" />
          </TouchableOpacity>
        </Link>

      </View>
    </View>
  );
}