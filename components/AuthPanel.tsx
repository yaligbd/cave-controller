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
import { alpha, radius, spacing, type } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDialog } from '@/contexts/DialogContext';
import { useTheme } from '@/contexts/ThemeContext';
import { AuthError, isPlausibleEmail, MIN_PASSWORD_LENGTH } from '@/services/AuthStore';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  const { palette } = useTheme();
  const router = useRouter();
  const dialog = useDialog();
  const { signIn, signUp, busy } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const isSignUp = mode === 'signup';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: palette.bg },
        scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
        brand: { alignItems: 'center', marginBottom: spacing.xxl, gap: spacing.md },
        wordmark: {
          fontFamily: type.fontFamily,
          fontSize: type.lg,
          fontWeight: 'bold',
          letterSpacing: 4,
          color: palette.textPrimary,
        },
        tagline: {
          fontFamily: type.fontFamily,
          fontSize: type.micro,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: palette.textMuted,
        },
        card: {
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: radius.sm,
          padding: spacing.xl,
          gap: spacing.lg,
        },
        heading: {
          fontFamily: type.fontFamily,
          fontSize: type.md,
          fontWeight: 'bold',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: palette.textPrimary,
        },
        fieldLabel: {
          fontFamily: type.fontFamily,
          fontSize: type.micro,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: palette.textMuted,
          marginBottom: spacing.xs,
        },
        inputRow: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: palette.bg,
          borderWidth: 1,
          borderRadius: radius.sm,
        },
        input: {
          flex: 1,
          minHeight: 46,
          paddingHorizontal: spacing.md,
          fontFamily: type.fontFamily,
          fontSize: type.sm,
          color: palette.textPrimary,
        },
        revealButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
        fieldError: {
          fontFamily: type.fontFamily,
          fontSize: type.xs,
          color: palette.fault,
          marginTop: spacing.xs,
        },
        submit: {
          minHeight: 48,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: palette.accent,
          backgroundColor: alpha(palette.accent, 0.15),
          alignItems: 'center',
          justifyContent: 'center',
        },
        submitText: {
          fontFamily: type.fontFamily,
          fontSize: type.sm,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: palette.accent,
          fontWeight: 'bold',
        },
        switchRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
        switchText: { fontFamily: type.fontFamily, fontSize: type.xs, color: palette.textSecondary },
        switchLink: {
          fontFamily: type.fontFamily,
          fontSize: type.xs,
          color: palette.accent,
          textTransform: 'uppercase',
          letterSpacing: 1,
        },
        // The honesty notice. Anyone using this deserves to know the account is
        // on the phone and protects nothing yet.
        notice: {
          flexDirection: 'row',
          gap: spacing.md,
          marginTop: spacing.xl,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: radius.sm,
          backgroundColor: palette.warnBg,
        },
        noticeText: {
          flex: 1,
          fontFamily: type.fontFamily,
          fontSize: type.xs,
          lineHeight: type.xs * 1.5,
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

  function borderFor(field: keyof FieldErrors) {
    return errors[field] ? palette.fault : palette.border;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <BatIcon size={44} />
            <Text style={styles.wordmark} allowFontScaling={false}>
              CAVEBAT
            </Text>
            <Text style={styles.tagline}>Autonomous cave mapping</Text>
          </View>

          <View style={styles.card}>
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

            <Pressable
              style={({ pressed }) => [styles.submit, { opacity: busy ? 0.6 : pressed ? 0.8 : 1 }]}
              onPress={submit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={palette.accent} />
              ) : (
                <Text style={styles.submitText} allowFontScaling={false}>
                  {isSignUp ? 'Create account' : 'Sign in'}
                </Text>
              )}
            </Pressable>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                {isSignUp ? 'Already have an account?' : 'No account yet?'}
              </Text>
              <Pressable onPress={() => router.replace(isSignUp ? '/login' : '/signup')}>
                <Text style={styles.switchLink}>{isSignUp ? 'Sign in' : 'Create one'}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.notice}>
            <Ionicons name="information-circle" size={16} color={palette.warn} />
            <Text style={styles.noticeText}>
              Accounts are stored on this phone only. Nothing is sent anywhere and nothing is
              shared between devices yet — that arrives with the server, which will also sync your
              flights.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
