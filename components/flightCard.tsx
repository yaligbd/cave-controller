import { styles } from '@/constants/theme';
import React from 'react';
import { Alert, ImageBackground, Text, TouchableOpacity, View } from 'react-native';
import { Flight } from '@/types/flightT';

//=========================================interfaces============================================
interface FlightCardProps {
    flight: Flight;
}

//=========================================components============================================
export default function FlightCard({flight}: FlightCardProps) {
    const handleCardPress = () => {
        Alert.alert(
          `Flight ${flight.name} has been selected` 
        );
      };
      //=========================================render============================================
  return (
    
              <TouchableOpacity style={styles.cardWrapper} onPress={handleCardPress}>
                

                <ImageBackground 
                  source={require('../assets/images/black-drone.jpg')} 
                  style={styles.cardImage}
                  imageStyle={{ borderRadius: 12 }} // This actually rounds the corners of the image itself
                >
                  {/* An extra view to make the text pop. This creates a semi-transparent dark overlay */}
                  <View style={styles.cardOverlay}>
                    <Text style={styles.cardTitle}>{flight.name}</Text>
                    <Text style={styles.cardSubtitle}>Max Altitude: {flight.maxAltitude} m</Text>
                    <Text style={styles.cardSubtitle}>Distance: {flight.distance} m</Text>
                    <Text style={styles.cardSubtitle}>Duration: {flight.duration} s</Text>
                    <Text style={styles.cardSubtitle}>Battery Usage: {flight.batteryUsage} %</Text>
                  </View>
                  
                </ImageBackground>
                
              </TouchableOpacity>

  );
}

