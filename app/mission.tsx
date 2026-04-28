
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import  CheckBox from 'expo-checkbox';
import Header from '@/components/Header';
import { styles } from '@/constants/theme';
export default function ScreenName() {

  const [missionTimer, setMissionTimer] = useState(0);
  const [missionMaxAltitude, setMissionMaxAltitude] = useState(0);

  const [avoidanceEnabled, setAvoidanceEnabled] = useState(false);
  const [rthEnabled, setRthEnabled] = useState(false);  
  return (
    <SafeAreaProvider style={styles.safeArea}>

      <Header></Header>
      <View style={styles.bodyContainer}>
      <Text style={styles.label}>Mission Timer: {missionTimer} seconds</Text>
      <TextInput onChangeText={(text) => setMissionTimer(Number(text))} keyboardType='numeric' value={missionTimer.toString()} placeholder="Enter mission timer" style={styles.input} />

      <Text style={styles.label}>Mission Max Altitude: {missionMaxAltitude} meters</Text>
      <TextInput onChangeText={(text) => setMissionMaxAltitude(Number(text))} keyboardType='numeric' value={missionMaxAltitude.toString()} placeholder="Enter mission max altitude" style={styles.input} />

      <View>
        <CheckBox style={styles.checkboxContainer} value={avoidanceEnabled} onValueChange={setAvoidanceEnabled} color={avoidanceEnabled ? '#007AFF' : undefined} />
        <Text style={styles.checkboxLabel}>Enable Obstacle Avoidance</Text>
      </View>
      <View>
        <CheckBox style={styles.checkboxContainer} value={rthEnabled} onValueChange={setRthEnabled} color={rthEnabled ? '#007AFF' : undefined} />
        <Text style={styles.checkboxLabel}>Enable RTH</Text>
      </View>
      </View>
    </SafeAreaProvider>
  );
}

