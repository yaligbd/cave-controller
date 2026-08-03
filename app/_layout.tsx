import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DroneConnectionProvider } from '@/contexts/DroneConnectionContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import 'react-native-reanimated';

import { I18nManager } from 'react-native';

// This app has no RTL-specific layouts. Force LTR so text and layout render
// consistently on devices set to an RTL locale (Hebrew, Arabic) instead of
// mirroring the whole UI.
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

function RootLayoutContent() {
  const { mode } = useTheme();

  return (
    <NavigationThemeProvider value={mode === 'day' ? DefaultTheme : DarkTheme}>
      {/* screenOptions={{ headerShown: false }} hides the default top text header on all screens */}
      {/* A simple self-closing Stack automatically handles all files in the app folder! */}
      <DroneConnectionProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </DroneConnectionProvider>
      <StatusBar style={mode === 'day' ? 'dark' : 'light'} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}
