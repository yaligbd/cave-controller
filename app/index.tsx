import Header from '@/components/Header';
import { styles } from '@/constants/theme';
import { useCameraPermissions } from 'expo-camera';
import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaProvider style={styles.safeArea}>
        <Header />
        <View style={localStyles.container}>
          <Text style={localStyles.warningText}>
            We need your permission to show the camera
          </Text>
          <Button onPress={requestPermission} title="Grant Permission" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <Header />
      <View style={localStyles.container}>
        <Text style={styles.label}>3D Simulation Sandbox</Text>
        

      </View>
    </SafeAreaProvider>
  );
}

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
  },
  warningText: {
    textAlign: 'center', 
    color: 'black', 
    marginBottom: 20,
    fontSize: 16,
  },
  cameraContainer: {
    width: '100%',
    height: 400,
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 20,
  },
  camera: {
    flex: 1,
  },
});