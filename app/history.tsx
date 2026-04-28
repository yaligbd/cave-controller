import Header from '@/components/Header';
import FlightCard from '@/components/flightCard';
import { styles } from '@/constants/theme';
import { demoFlights } from '@/data/demoFlights';
import React from 'react';
import { Alert, View,ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {

  const handleCardPress = () => {
    Alert.alert(
      "Feature Coming Soon!",
      "Sorry, this feature is unavailable at the moment."
    );
  };
  return (
    <SafeAreaProvider style={styles.safeArea}>

        <Header/>
      <ScrollView style={styles.bodyContainer}>
        {demoFlights.map((flight) => (
          <FlightCard key={flight.id} flight={flight} />  
        ))}
      </ScrollView>
    </SafeAreaProvider>
  );
}

