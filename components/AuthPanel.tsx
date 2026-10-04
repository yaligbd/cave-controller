// Sign in and sign up. One component, two modes.
//
// Both modes share every field, every validation rule and every piece of
// styling, so they are one component rather than two screens that would
// gradually stop matching each other.
//
// Errors are shown INLINE, against the field that caused them, not in a dialog.
// A dialog for "that password is too short" makes the operator dismiss it and
// then work out which field it meant. Dialogs are kept for failures that are
// not about a field -- storage errors and the like.

import BatIcon from '@/components/BatIcon';
import Button from '@/components/ui/Button';
import { Gradient } from '@/components/ui/Gradient';
import Reveal from '@/components/ui/Reveal';
import Surface from '@/components/ui/Surface';
import { alpha, radius, shadow, spacing, type } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDialog } from '@/contexts/DialogContext';
import { useTheme } from '@/contexts/ThemeContext';
import { AuthError, isPlausibleEmail, MIN_PASSWORD_LENGTH } from '@/services/AuthStore';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Mode = 'signin' | 'signup';

type FieldErrors = { name?: string; email?: string; password?: string };

export default function AuthPanel({ mode }: { mode: Mode }) {
  const { palette, mode: themeMode } = useTheme();
  const router = useRouter();
  const dialog = useDialog();
  const { signIn, signUp, busy } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Which field has the caret. Three identical boxes with the keyboard over
  // them is genuinely confusing on a phone; the active one gets the accent.
  const [focused, setFocused] = useState<keyof FieldErrors | null>(null);

  const isSignUp = mode === 'signup';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: palette.bg },
        scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
        brand: { alignItems: 'center', marginBottom: spacing.xxl, gap: spacing.md },
        wordmark: {
          fontFamily: type.sansMedium,
          fontSize: type.xxl,
          fontWeight: '700',
          letterSpacing: 3,
          color: palette.textPrimary,
        },
        tagline: {
          fontFamily: type.sans,
          fontSize: type.sm,
          letterSpacing: 1,
          color: palette.textMuted,
        },
        card: {
          padding: spacing.xl,
          gap: spacing.lg,
        },
        heading: {
          fontFamily: type.sansMedium,
          fontSize: type.xl,
          fontWeight: '700',
          letterSpacing: -0.3,
          color: palette.textPrimary,
        },
        fieldLabel: {
          fontFamily: type.sansMedium,
          fontSize: type.xs,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: palette.textMuted,
          marginBottom: spacing.sm,
        },
        inputRow: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: alpha(palette.bg, 0.6),
          borderWidth: 1.5,
          borderRadius: radius.sm,
        },
        input: {
          flex: 1,
          minHeight: 52,
          paddingHorizontal: spacing.lg,
          fontFamily: type.sans,
          fontSize: type.md,
          color: palette.textPrimary,
        },
        revealButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
        fieldError: {
          fontFamily: type.sans,
          fontSize: type.xs,
          color: palette.fault,
          marginTop: spacing.xs,
        },
        switchRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
        switchText: { fontFamily: type.sans, fontSize: type.sm, color: palette.textSecondary },
        switchLink: {
          fontFamily: type.sansMedium,
          fontSize: type.sm,
          fontWeight: '700',
          color: palette.accent,
          letterSpacing: 0.3,
        },
        // The honesty notice. Anyone using this deserves to know the account is
        // on the phone and protects nothing yet.
        notice: {
          flexDirection: 'row',
          gap: spacing.md,
          marginTop: spacing.xl,
          backgroundColor: alpha(palette.warn, 0.12),
          borderColor: alpha(palette.warn, 0.4),
          ...shadow('sm', palette),
        },
        noticeText: {
          flex: 1,
          fontFamily: type.sans,
          fontSize: type.xs,
          lineHeight: type.xs * 1.55,
          color: palette.textSecondary,
        },
      }),
    [palette]
  );

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (isSignUp && name.trim().length < 2) next.name = 'Give a name of at least 2 characters.';
    if (!isPlausibleEmail(email)) next.email = 'That does not look like an email address.';
    if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    return next;
  }

  async function submit() {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    try {
      if (isSignUp) await signUp(email, password, name);
      else await signIn(email, password);
      router.replace('/');
    } catch (err) {
      // A known auth failure points at the field that caused it. Anything else
      // is genuinely unexpected and gets a dialog with the raw text.
      if (err instanceof AuthError) {
        switch (err.code) {
          case 'email-taken':
          case 'no-such-account':
          case 'invalid-email':
            setErrors({ email: err.message });
            return;
          case 'wrong-password':
          case 'weak-password':
            setErrors({ password: err.message });
            return;
        }
      }
      await dialog.error(
        isSignUp ? 'Could not create account' : 'Could not sign in',
        'Something failed that was not the email or the password.',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // An error outranks focus: a red box that turned blue when tapped would hide
  // the thing the operator has to fix.
  function borderFor(field: keyof FieldErrors) {
    if (errors[field]) return palette.fault;
    if (focused === field) return palette.accent;
    return palette.border;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Gradient colors={palette.gradBackdrop} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Reveal style={styles.brand} from={20}>
            <BatIcon size={56} />
            <Text style={styles.wordmark} allowFontScaling={false}>
              CAVEBAT
            </Text>
            <Text style={styles.tagline}>Autonomous cave mapping</Text>
          </Reveal>

          <Reveal index={1}>
          <Surface level="lg" padded={false} style={styles.card}>
            <Text style={styles.heading}>{isSignUp ? 'Create account' : 'Sign in'}</Text>

            {isSignUp && (
              <View>
                <Text style={styles.fieldLabel}>Name</Text>
                <View style={[styles.inputRow, { borderColor: borderFor('name') }]}>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={(t) => {
                      setName(t);
                      if (errors.name) setErrors({ ...errors, name: undefined });
                    }}
                    placeholder="Your name"
                    placeholderTextColor={palette.textMuted}
                    autoCapitalize="words"
                    autoComplete="name"
                    textContentType="name"
                    returnKeyType="next"
                    keyboardAppearance={themeMode === 'day' ? 'light' : 'dark'}
                    onFocus={() => setFocused('name')}
                    onBlur={() => setFocused(null)}
                  />
                </View>
                {!!errors.name && <Text style={styles.fieldError}>{errors.name}</Text>}
              </View>
            )}

            <View>
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={[styles.inputRow, { borderColor: borderFor('email') }]}>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (errors.email) setErrors({ ...errors, email: undefined });
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={palette.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  keyboardAppearance={themeMode === 'day' ? 'light' : 'dark'}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                />
              </View>
              {!!errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}
            </View>

            <View>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={[styles.inputRow, { borderColor: borderFor('password') }]}>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (errors.password) setErrors({ ...errors, password: undefined });
                  }}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  placeholderTextColor={palette.textMuted}
                  secureTextEntry={!reveal}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={submit}
                  returnKeyType="go"
                  textContentType={isSignUp ? 'newPassword' : 'password'}
                  keyboardAppearance={themeMode === 'day' ? 'light' : 'dark'}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                />
                <Pressable
                  style={styles.revealButton}
                  onPress={() => setReveal((r) => !r)}
                  hitSlop={8}
                  accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={reveal ? 'eye-off' : 'eye'}
                    size={18}
                    color={palette.textMuted}
                  />
                </Pressable>
              </View>
              {!!errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
            </View>

            <Button
              label={busy ? 'Working…' : isSignUp ? 'Create account' : 'Sign in'}
              variant="solid"
              disabled={busy}
              onPress={submit}
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                {isSignUp ? 'Already have an account?' : 'No account yet?'}
              </Text>
              <Pressable onPress={() => router.replace(isSignUp ? '/login' : '/signup')}>
                <Text style={styles.switchLink}>{isSignUp ? 'Sign in' : 'Create one'}</Text>
              </Pressable>
            </View>
          </Surface>
          </Reveal>

          <Surface tone="glass" style={styles.notice}>
            <Ionicons name="information-circle" size={18} color={palette.warn} />
            <Text style={styles.noticeText}>
              Accounts are stored on this phone only. Nothing is sent anywhere and nothing is
              shared between devices yet — that arrives with the server, which will also sync your
              flights.
            </Text>
          </Surface>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
