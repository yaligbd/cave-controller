import { useTheme } from '@/contexts/ThemeContext';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * The backdrop every screen sits on.
 *
 * IT IS A SOLID COLOUR, DELIBERATELY. This drew the backdrop as a full-screen
 * SVG gradient for about a day, and it cost real frames: an SVG that size sits
 * behind every screen in the app, including the one holding the 3D WebView,
 * where it made the hologram stutter and stick. A gradient nobody can quite see
 * is not worth a 3D view that does not turn smoothly.
 *
 * Gradients are still used, but only on small bounded things that earn them --
 * buttons, badges, sheets, the flight cards. See components/ui/Gradient.tsx.
 */
export default function Screen({ children }: { children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: palette.bg }}>
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaProvider>
  );
}
