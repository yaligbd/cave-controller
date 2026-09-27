import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DialogProvider } from '@/contexts/DialogContext';
import { DroneConnectionProvider } from '@/contexts/DroneConnectionContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import React, { useEffect } from 'react';
import 'react-native-reanimated';

import { ActivityIndicator, I18nManager, View } from 'react-native';

// This app has no RTL-specific layouts. Force LTR so text and layout render
// consistently on devices set to an RTL locale (Hebrew, Arabic) instead of
// mirroring the whole UI.
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

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
