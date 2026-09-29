import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DialogProvider } from '@/contexts/DialogContext';
import { DroneConnectionProvider } from '@/contexts/DroneConnectionContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import React, { useEffect } from 'react';
import 'react-native-reanimated';

import { ActivityIndicator, I18nManager, LogBox, View } from 'react-native';

// This app has no RTL-specific layouts. Force LTR so text and layout render
// consistently on devices set to an RTL locale (Hebrew, Arabic) instead of
// mirroring the whole UI.
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

// Keep OUR OWN diagnostics out of React Native's dev overlay.
//
// LogBox turns every console.error() into a red bar across the bottom of the
// screen and every console.warn() into a yellow one. That is useful for a React
// mistake. It is actively harmful here, because the things it was catching are
// not UI bugs -- they are a drone that went out of range, a log block that needs
// rebuilding, a download worth retrying. Normal events in a flight.
//
// And the overlay is the worst possible way to show them: it truncates to about
// forty characters ("[drone] CRTP write failed: Error: CRTP writ..."), it covers
// the flight controls at the bottom of the mission screen, and it appears while
// the aircraft is in the air. A single disconnect produces several -- one per
// log block, four seconds later, as the blocks notice the drone has gone.
//
// Converting the thirty-odd call sites one at a time would mean that many more
// edits to flight-critical files for no change in behaviour. Every message we
// write is prefixed, so filtering by prefix catches all of them at once,
// including the ones not yet converted. Everything that matters already reaches
// the Logs screen with its full text and what to do about it, and everything
// still reaches Metro for a laptop.
//
// A genuine React error -- a component that throws, a bad hook call -- has no
// such prefix and still appears loudly, which is what the overlay is for.
LogBox.ignoreLogs([
  /^\[drone\]/,
  /^\[flight\]/,
  /^\[flights\]/,
  /^\[download\]/,
  /^\[crtp/,
  /^\[ble\]/,
  /^\[log/,
  /^\[toc-cache\]/,
  /^\[theme\]/,
  /^\[settings\]/,
]);

// Routes reachable without an account.
const PUBLIC_ROUTES = ['/login', '/signup'];

/**
 * Sends the operator to sign-in when there is no account, and away from
 * sign-in when there is one.
 *
 * Nothing happens until `restoring` clears. Redirecting on a session that has
 * not been read yet would bounce a signed-in user to the sign-in screen on
 * every cold start, which reads as "it forgot me again".
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { account, restoring } = useAuth();
  const { palette } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const onPublicRoute = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (restoring) return;
    if (!account && !onPublicRoute) router.replace('/login');
    else if (account && onPublicRoute) router.replace('/');
  }, [account, restoring, onPublicRoute, router]);

  if (restoring) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutContent() {
  const { mode } = useTheme();

  return (
    <NavigationThemeProvider value={mode === 'day' ? DefaultTheme : DarkTheme}>
      {/* DialogProvider sits outside everything that might need to raise an
          error, which includes the drone connection itself. */}
      <DialogProvider>
        <AuthProvider>
          {/* The drone provider stays INSIDE the gate but is not gated on a
              session: a BLE link being torn down and rebuilt by a sign-in
              would be a genuinely bad idea mid-flight. It simply mounts once. */}
          <DroneConnectionProvider>
            <AuthGate>
              {/* screenOptions={{ headerShown: false }} hides the default top text header on all screens */}
              <Stack screenOptions={{ headerShown: false }} />
            </AuthGate>
          </DroneConnectionProvider>
        </AuthProvider>
      </DialogProvider>
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
