import { Gradient } from '@/components/ui/Gradient';
import { useTheme } from '@/contexts/ThemeContext';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * The backdrop every screen sits on.
 *
 * One flat background colour is what makes a dark app look like a void with
 * boxes floating in it. A barely-there vertical gradient gives the screen a
 * top and a bottom, so cards read as sitting on something.
 */
export default function Screen({ children }: { children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: palette.bg }}>
      <Gradient colors={palette.gradBackdrop} />
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaProvider>
  );
}
