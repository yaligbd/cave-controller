import { styles } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export default function Header() {
  return (
    <View style={styles.headerContainer}>

      {/* LEFT SIDE: The 3 Navigation Options */}
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
      <Link href="/history" asChild>
        <TouchableOpacity>
          <Text style={styles.navText}>History</Text>
        </TouchableOpacity>
      </Link>
      </View>

      {/* RIGHT SIDE: The 2 Round Icon Buttons */}
      <View style={styles.iconButtons}>
        <TouchableOpacity style={styles.roundButton}>
          <Ionicons name="wifi" size={20} color="white" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.roundButton}>
          <Ionicons name="bluetooth" size={20} color="white" />
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

