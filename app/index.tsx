import Header from '@/components/Header';
import FlightCard from '@/components/flightCard';
import { styles } from '@/constants/theme';
import { demoFlights } from '@/data/demoFlights';
import React from 'react';
import { Alert, View, ScrollView, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {

  return (
    <SafeAreaProvider style={styles.safeArea}>

      <Header></Header>
      <Text style={styles.label}>3D Simulation</Text>
    </SafeAreaProvider>
  );
}

